import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECEIVER_SESSION_ID } from '../../../src/shared/contracts';
import { GrpcScadaTransport } from '../../../src/main/scada/grpc-scada-transport';
import type { WireCommandBatch } from '../../../src/main/scada/protocol';

const SESSION_ID = '83c5b124-d12d-4a2b-8b67-fc0b425a7e22';
const POINT_ID = '11111111-1465-4908-b935-000000000100';
const protoPath = path.join(process.cwd(), 'proto', 'user.proto');

interface TestServerState {
  subscriber: grpc.ServerDuplexStream<WireCommandBatch, WireCommandBatch> | null;
  subscribeToken: string | null;
  sendToken: string | null;
  closeToken: string | null;
  sentCommand: WireCommandBatch | null;
  sendCount: number;
  failSend: boolean;
  closedSession: string | null;
}

let server: grpc.Server | null = null;

afterEach(async () => {
  if (!server) return;
  const current = server;
  server = null;
  await new Promise<void>((resolve) => current.tryShutdown(() => resolve()));
});

describe('GrpcScadaTransport integration', () => {
  it('opens a session, receives telemetry, sends exact metadata and closes cleanly', async () => {
    const state: TestServerState = {
      subscriber: null,
      subscribeToken: null,
      sendToken: null,
      closeToken: null,
      sentCommand: null,
      sendCount: 0,
      failSend: false,
      closedSession: null,
    };
    const endpoint = await startFakeServer(state);
    const received: unknown[] = [];
    const terminated = vi.fn();
    const now = new Date('2026-09-01T09:10:11.123Z');
    const transport = new GrpcScadaTransport(protoPath, {
      onTelemetry: (points) => received.push(...points),
      onTerminated: terminated,
    }, () => now);

    await expect(transport.connect(endpoint)).resolves.toBe(SESSION_ID);
    await vi.waitFor(() => expect(state.subscriber).not.toBeNull());
    state.subscriber?.write({
      core_command: [{
        response_from_uuid_session: SESSION_ID,
        response_to_uuid_session: RECEIVER_SESSION_ID,
        scada_tm: {
          id_tm: POINT_ID,
          type_tm: 'TS',
          value_ts: 1,
          flag_tm: 65_535,
          lower_time: { seconds: '1788253811', nanos: 123_000_000 },
          upper_time: { seconds: '1788253811', nanos: 123_000_000 },
        },
      }],
    });
    await vi.waitFor(() => expect(received).toHaveLength(1));

    const result = await transport.sendCommand({
      pointId: POINT_ID,
      type: 'TS',
      value: -12,
      flag: -1,
    });
    expect(result).toMatchObject({ outcome: 'accepted', responseCode: 0 });
    expect(state.subscribeToken).toBe(SESSION_ID);
    expect(state.sendToken).toBe(SESSION_ID);
    expect(state.sentCommand).toMatchObject({
      core_command: [{
        scada_type_command: 'CHANGE_TM',
        response_from_uuid_session: SESSION_ID,
        response_to_uuid_session: RECEIVER_SESSION_ID,
        scada_tm: {
          id_tm: POINT_ID,
          type_tm: 'TS',
          value_ts: -12,
          flag_tm: -1,
        },
      }],
    });
    expect(received[0]).toMatchObject({ type: 'TS', value: 1, flag: -1 });

    await transport.close();
    expect(state.closedSession).toBe(SESSION_ID);
    expect(state.closeToken).toBe(SESSION_ID);
    expect(terminated).not.toHaveBeenCalled();
  });

  it('does not repeat a control command after an ambiguous transport failure', async () => {
    const state: TestServerState = {
      subscriber: null,
      subscribeToken: null,
      sendToken: null,
      closeToken: null,
      sentCommand: null,
      sendCount: 0,
      failSend: true,
      closedSession: null,
    };
    const endpoint = await startFakeServer(state);
    const transport = new GrpcScadaTransport(protoPath, {
      onTelemetry: () => undefined,
      onTerminated: () => undefined,
    });

    await transport.connect(endpoint);
    const result = await transport.sendCommand({
      pointId: POINT_ID,
      type: 'TS',
      value: 1,
      flag: 257,
    });

    expect(result).toMatchObject({ outcome: 'unknown', responseCode: grpc.status.UNAVAILABLE });
    expect(state.sendCount).toBe(1);
    await transport.close();
  });
});

async function startFakeServer(state: TestServerState): Promise<string> {
  const definition = loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as grpc.GrpcObject;
  const Service = loaded.scadaservice;
  if (typeof Service !== 'function') throw new Error('Test service was not loaded.');

  server = new grpc.Server();
  server.addService((Service as grpc.ServiceClientConstructor).service, {
    openSession: (
      _call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
      callback: grpc.sendUnaryData<Record<string, unknown>>,
    ) => callback(null, { response_uuid_session: SESSION_ID }),
    closeSession: (
      call: grpc.ServerUnaryCall<{ response_uuid_session: string }, unknown>,
      callback: grpc.sendUnaryData<Record<string, unknown>>,
    ) => {
      state.closeToken = firstMetadataValue(call.metadata, 'tokensession');
      state.closedSession = call.request.response_uuid_session;
      callback(null, { response_message: 'SUCCESS', response_code: 0 });
    },
    sendCommandChangeTM: (
      call: grpc.ServerUnaryCall<WireCommandBatch, unknown>,
      callback: grpc.sendUnaryData<Record<string, unknown>>,
    ) => {
      state.sendCount += 1;
      state.sendToken = firstMetadataValue(call.metadata, 'tokensession');
      state.sentCommand = call.request;
      if (state.failSend) {
        callback({
          name: 'Unavailable',
          message: 'ACK lost after receipt',
          code: grpc.status.UNAVAILABLE,
          details: 'ACK lost after receipt',
          metadata: new grpc.Metadata(),
        });
        return;
      }
      callback(null, { response_message: 'SUCCESS', response_code: 0 });
    },
    subscribeCommandChangeTM: (
      call: grpc.ServerDuplexStream<WireCommandBatch, WireCommandBatch>,
    ) => {
      state.subscribeToken = firstMetadataValue(call.metadata, 'tokensession');
      state.subscriber = call;
      call.sendMetadata(new grpc.Metadata());
      call.on('data', () => undefined);
      call.on('error', () => undefined);
    },
  });

  const port = await new Promise<number>((resolve, reject) => {
    server?.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });
  return `127.0.0.1:${port}`;
}

function firstMetadataValue(metadata: grpc.Metadata, key: string): string | null {
  const value = metadata.get(key)[0];
  return typeof value === 'string' ? value : null;
}

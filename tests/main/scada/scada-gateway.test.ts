import { describe, expect, it, vi } from 'vitest';
import type { ConnectionSnapshot, TelemetryPoint } from '../../../src/shared/contracts';
import type { ClientSettings, SettingsRepository } from '../../../src/main/settings-repository';
import { ScadaGateway } from '../../../src/main/scada/scada-gateway';
import type { ScadaTransport, ScadaTransportCallbacks } from '../../../src/main/scada/scada-transport';

const SESSION_1 = '83c5b124-d12d-4a2b-8b67-fc0b425a7e22';
const SESSION_2 = 'fa85e426-6dba-4e11-aef9-67f78ca77fca';
const POINT: TelemetryPoint = {
  id: '11111111-1465-4908-b935-000000000100',
  type: 'TS',
  value: 1,
  flag: 257,
  lowerTime: '2026-09-01T10:00:00.000Z',
  upperTime: '2026-09-01T10:00:00.000Z',
  receivedAt: '2026-09-01T10:00:00.100Z',
  senderSessionId: SESSION_1,
  receiverSessionId: '00000000-0000-1000-a000-000000000001',
  telemetryGeneration: 0,
};

class MemorySettings implements SettingsRepository {
  value: ClientSettings = { serverAddress: '127.0.0.1:9090' };
  async load() { return this.value; }
  async save(settings: ClientSettings) { this.value = settings; }
}

class FakeTransport implements ScadaTransport {
  closeCount = 0;
  constructor(
    private readonly callbacks: ScadaTransportCallbacks,
    private readonly sessionId: string,
  ) {}
  async connect() { return this.sessionId; }
  async sendCommand() {
    return {
      outcome: 'accepted' as const,
      responseCode: 0,
      message: 'accepted',
      sentAt: '2026-09-01T10:00:00.000Z',
    };
  }
  async close() { this.closeCount += 1; }
  emit(points: TelemetryPoint[]) { this.callbacks.onTelemetry(points); }
  terminate(message = 'stream lost') { this.callbacks.onTerminated(new Error(message)); }
}

describe('ScadaGateway', () => {
  it('stores telemetry by point and emits local batches', async () => {
    const transports: FakeTransport[] = [];
    const gateway = new ScadaGateway(
      new MemorySettings(),
      (callbacks) => {
        const transport = new FakeTransport(callbacks, SESSION_1);
        transports.push(transport);
        return transport;
      },
      undefined,
      () => 0.5,
      () => new Date('2026-09-01T10:00:00.100Z'),
    );
    const connections: ConnectionSnapshot[] = [];
    const batches: number[] = [];
    gateway.onConnectionChanged((connection) => connections.push(connection));
    gateway.onTelemetryReceived((batch) => batches.push(batch.localSequence));

    await gateway.initialize();
    await gateway.connect('127.0.0.1:9090');
    transports[0].emit([POINT, { ...POINT, value: 2 }]);

    expect(connections.at(-1)).toMatchObject({ phase: 'connected', sessionId: SESSION_1 });
    expect(gateway.getBootstrap().points).toEqual([{
      ...POINT,
      value: 2,
      telemetryGeneration: 1,
    }]);
    expect(gateway.getBootstrap().events).toHaveLength(2);
    expect(batches).toEqual([1]);
  });

  it('opens a new session after stream termination and stops retry on disconnect', async () => {
    vi.useFakeTimers();
    const transports: FakeTransport[] = [];
    const sessions = [SESSION_1, SESSION_2];
    const gateway = new ScadaGateway(
      new MemorySettings(),
      (callbacks) => {
        const transport = new FakeTransport(callbacks, sessions[transports.length] ?? SESSION_2);
        transports.push(transport);
        return transport;
      },
      undefined,
      () => 0.5,
    );

    await gateway.initialize();
    await gateway.connect('127.0.0.1:9090');
    transports[0].emit([POINT]);
    transports[0].terminate();
    expect(gateway.getBootstrap().connection).toMatchObject({ phase: 'reconnecting', reconnectAttempt: 1 });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(transports).toHaveLength(2);
    expect(gateway.getBootstrap().connection).toMatchObject({ phase: 'connected', sessionId: SESSION_2 });
    expect(gateway.getBootstrap().connection.telemetryGeneration).toBe(2);
    expect(gateway.getBootstrap().points[0]?.telemetryGeneration).toBe(1);

    transports[1].emit([{ ...POINT, value: 0 }]);
    expect(gateway.getBootstrap().points[0]).toMatchObject({
      value: 0,
      telemetryGeneration: 2,
    });

    transports[1].terminate();
    expect(gateway.getBootstrap().connection).toMatchObject({
      phase: 'reconnecting',
      reconnectAttempt: 2,
    });
    await gateway.disconnect();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(transports).toHaveLength(2);
    expect(gateway.getBootstrap().connection.phase).toBe('idle');
    vi.useRealTimers();
  });
});

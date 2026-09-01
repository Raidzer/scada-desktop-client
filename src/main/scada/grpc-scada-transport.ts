import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { CommandResult, SendCommandInput, TelemetryPoint } from '../../shared/contracts';
import { RECEIVER_SESSION_ID } from '../../shared/contracts';
import { isUuid } from '../../shared/validation';
import {
  buildWireCommand,
  mapWireBatch,
  type WireCommandBatch,
  type WireOpenSessionResponse,
  type WireResultResponse,
} from './protocol';
import type { ScadaTransport, ScadaTransportCallbacks } from './scada-transport';

const OPEN_TIMEOUT_MS = 5_000;
const SUBSCRIBE_READY_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = 1_500;
const MAX_RECEIVE_BYTES = 64 * 1024 * 1024;
const MAX_SEND_BYTES = 4 * 1024 * 1024;

type UnaryCallback<T> = (error: grpc.ServiceError | null, response?: T) => void;

interface DynamicScadaClient extends grpc.Client {
  openSession(
    request: Record<string, never>,
    options: grpc.CallOptions,
    callback: UnaryCallback<WireOpenSessionResponse>,
  ): grpc.ClientUnaryCall;
  closeSession(
    request: { response_uuid_session: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: UnaryCallback<WireResultResponse>,
  ): grpc.ClientUnaryCall;
  sendCommandChangeTM(
    request: WireCommandBatch,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: UnaryCallback<WireResultResponse>,
  ): grpc.ClientUnaryCall;
  subscribeCommandChangeTM(
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
  ): grpc.ClientDuplexStream<WireCommandBatch, WireCommandBatch>;
}

type DynamicScadaClientConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: grpc.ChannelOptions,
) => DynamicScadaClient;

export class GrpcScadaTransport implements ScadaTransport {
  private client: DynamicScadaClient | null = null;
  private stream: grpc.ClientDuplexStream<WireCommandBatch, WireCommandBatch> | null = null;
  private sessionId: string | null = null;
  private closed = false;
  private ready = false;
  private deferredTerminal: Error | null = null;
  private terminalNotified = false;

  constructor(
    private readonly protoPath: string,
    private readonly callbacks: ScadaTransportCallbacks,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async connect(address: string): Promise<string> {
    if (this.client) {
      throw new Error('gRPC transport уже был запущен.');
    }

    this.closed = false;
    this.ready = false;
    this.deferredTerminal = null;
    this.terminalNotified = false;
    const Service = loadServiceConstructor(this.protoPath);
    const client = new Service(address, grpc.credentials.createInsecure(), {
      // A control command must never be retried after an ambiguous transport failure.
      // Channel reconnection still works when grpc-js service-config retries are disabled.
      'grpc.enable_retries': 0,
      'grpc.max_receive_message_length': MAX_RECEIVE_BYTES,
      'grpc.max_send_message_length': MAX_SEND_BYTES,
    });
    this.client = client;

    try {
      const response = await new Promise<WireOpenSessionResponse>((resolve, reject) => {
        client.openSession(
          {},
          { deadline: Date.now() + OPEN_TIMEOUT_MS },
          (error, value) => {
            if (error || !value) reject(error ?? new Error('OpenSession вернул пустой ответ.'));
            else resolve(value);
          },
        );
      });

      const sessionId = response.response_uuid_session?.trim() ?? '';
      if (!isUuid(sessionId)) {
        throw new Error('Java-сервер вернул некорректный UUID сессии.');
      }

      this.sessionId = sessionId.toLowerCase();
      await this.openTelemetryStream(client, this.createMetadata(this.sessionId));
      if (this.deferredTerminal) throw this.deferredTerminal;
      this.ready = true;
      return this.sessionId;
    } catch (error) {
      this.closed = true;
      this.stream?.cancel();
      this.stream = null;
      this.sessionId = null;
      client.close();
      this.client = null;
      throw toError(error);
    }
  }

  async sendCommand(command: SendCommandInput): Promise<CommandResult> {
    const client = this.client;
    const sessionId = this.sessionId;
    const sentAt = this.now();
    if (!client || !sessionId || this.closed) {
      throw new Error('Нет активного соединения с Java-сервером.');
    }

    const request = buildWireCommand(command, sessionId, RECEIVER_SESSION_ID, sentAt);
    const metadata = this.createMetadata(sessionId);

    return new Promise<CommandResult>((resolve) => {
      client.sendCommandChangeTM(
        request,
        metadata,
        { deadline: Date.now() + COMMAND_TIMEOUT_MS },
        (error, response) => {
          if (error || !response) {
            resolve({
              outcome: 'unknown',
              responseCode: error?.code ?? null,
              message: 'Не удалось подтвердить приём команды. Сервер мог успеть её принять; команда не будет отправлена повторно.',
              sentAt: sentAt.toISOString(),
            });
            return;
          }

          const responseCode = Number(response.response_code ?? -1);
          resolve({
            outcome: responseCode === 0 ? 'accepted' : 'rejected',
            responseCode,
            message: responseCode === 0
              ? 'Сервер принял команду в обработку. Это не подтверждает её исполнение.'
              : (response.response_message || 'Сервер отклонил команду.'),
            sentAt: sentAt.toISOString(),
          });
        },
      );
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const client = this.client;
    const stream = this.stream;
    const sessionId = this.sessionId;
    this.client = null;
    this.stream = null;
    this.sessionId = null;

    try {
      if (client && sessionId) {
        const metadata = this.createMetadata(sessionId);
        await new Promise<void>((resolve) => {
          client.closeSession(
            { response_uuid_session: sessionId },
            metadata,
            { deadline: Date.now() + CLOSE_TIMEOUT_MS },
            () => resolve(),
          );
        });
      }
    } finally {
      // The Java reference throws from request-observer.onCompleted(), so cancel rather than end.
      stream?.cancel();
      client?.close();
    }
  }

  private openTelemetryStream(client: DynamicScadaClient, metadata: grpc.Metadata): Promise<void> {
    const stream = client.subscribeCommandChangeTM(metadata, {});
    this.stream = stream;

    return new Promise<void>((resolve, reject) => {
      let opening = true;
      const readyTimer = setTimeout(() => {
        if (!opening) return;
        opening = false;
        reject(new Error('Java-сервер не подтвердил подписку на телеметрию за 5 секунд.'));
      }, SUBSCRIBE_READY_TIMEOUT_MS);

      const markReady = () => {
        if (!opening) return;
        opening = false;
        clearTimeout(readyTimer);
        resolve();
      };
      const fail = (error: unknown) => {
        const normalized = toError(error);
        if (opening) {
          opening = false;
          clearTimeout(readyTimer);
          reject(normalized);
          return;
        }
        if (!this.ready) {
          this.deferredTerminal = normalized;
          return;
        }
        this.handleTerminal(normalized);
      };

      stream.on('metadata', markReady);
      stream.on('data', (batch: WireCommandBatch) => {
        markReady();
        if (this.closed) return;
        const points = mapWireBatch(batch, this.now());
        if (points.length > 0) this.safeTelemetryCallback(points);
      });
      stream.on('error', (error: grpc.ServiceError) => fail(error));
      stream.on('end', () => fail(new Error('Поток телеметрии завершён сервером.')));
      stream.on('status', (status: grpc.StatusObject) => {
        if (status.code !== grpc.status.OK) {
          fail(new Error(`Поток телеметрии закрыт: ${status.details || status.code}.`));
        }
      });
    });
  }

  private createMetadata(sessionId: string): grpc.Metadata {
    const metadata = new grpc.Metadata();
    metadata.set('tokensession', sessionId);
    return metadata;
  }

  private safeTelemetryCallback(points: TelemetryPoint[]): void {
    try {
      this.callbacks.onTelemetry(points);
    } catch {
      // A renderer/store failure must not crash the Electron main process or gRPC stream.
    }
  }

  private handleTerminal(error: unknown): void {
    if (this.closed || this.terminalNotified) return;
    this.terminalNotified = true;
    this.callbacks.onTerminated(toError(error));
  }
}

function loadServiceConstructor(protoPath: string): DynamicScadaClientConstructor {
  const definition = loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as grpc.GrpcObject;
  const Service = loaded.scadaservice;
  if (typeof Service !== 'function') {
    throw new Error('В user.proto не найден service scadaservice.');
  }
  return Service as unknown as DynamicScadaClientConstructor;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

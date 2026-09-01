import { EventEmitter } from 'node:events';
import type {
  BootstrapSnapshot,
  CommandResult,
  ConnectionSnapshot,
  SendCommandInput,
  TelemetryBatch,
  TelemetryEvent,
  TelemetryPoint,
} from '../../shared/contracts';
import { RECEIVER_SESSION_ID } from '../../shared/contracts';
import { parseServerAddress, validateCommandInput } from '../../shared/validation';
import type { SettingsRepository } from '../settings-repository';
import type { ScadaTransport, ScadaTransportFactory } from './scada-transport';

const EVENT_LIMIT = 250;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const STABLE_CONNECTION_MS = 10_000;

interface Scheduler {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}

const defaultScheduler: Scheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer),
};

export class ScadaGateway {
  private readonly events = new EventEmitter();
  private readonly points = new Map<string, TelemetryPoint>();
  private readonly recentEvents: TelemetryEvent[] = [];
  private connection: ConnectionSnapshot = {
    phase: 'idle',
    address: '127.0.0.1:9090',
    sessionId: null,
    telemetryGeneration: 0,
    reconnectAttempt: 0,
    message: 'Соединение не установлено.',
    changedAt: new Date().toISOString(),
  };
  private transport: ScadaTransport | null = null;
  private desiredConnected = false;
  private generation = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private localSequence = 0;
  private telemetryGeneration = 0;

  constructor(
    private readonly settings: SettingsRepository,
    private readonly transportFactory: ScadaTransportFactory,
    private readonly scheduler: Scheduler = defaultScheduler,
    private readonly random: () => number = Math.random,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initialize(): Promise<void> {
    const saved = await this.settings.load();
    try {
      this.connection = {
        ...this.connection,
        address: parseServerAddress(saved.serverAddress),
      };
    } catch {
      // Keep the safe default when the settings file was edited manually.
    }
  }

  getBootstrap(): BootstrapSnapshot {
    return {
      connection: { ...this.connection },
      savedAddress: this.connection.address,
      receiverSessionId: RECEIVER_SESSION_ID,
      points: [...this.points.values()],
      events: [...this.recentEvents],
    };
  }

  async connect(rawAddress: string): Promise<ConnectionSnapshot> {
    const address = parseServerAddress(rawAddress);
    const addressChanged = address !== this.connection.address;
    this.desiredConnected = true;
    this.generation += 1;
    const generation = this.generation;
    this.cancelTimers();
    this.reconnectAttempt = 0;

    const previousTransport = this.transport;
    this.transport = null;
    if (previousTransport) await previousTransport.close();

    if (addressChanged) {
      this.points.clear();
      this.recentEvents.length = 0;
      this.localSequence += 1;
      this.emitTelemetry({
        localSequence: this.localSequence,
        receivedAt: this.now().toISOString(),
        points: [],
        reset: true,
      });
    }

    await this.settings.save({ serverAddress: address });
    this.updateConnection({
      phase: 'connecting',
      address,
      sessionId: null,
      reconnectAttempt: 0,
      message: `Подключение к ${address}…`,
    });

    await this.performConnect(generation, address);
    return { ...this.connection };
  }

  async disconnect(): Promise<ConnectionSnapshot> {
    this.desiredConnected = false;
    this.generation += 1;
    this.cancelTimers();
    this.updateConnection({
      phase: 'disconnecting',
      sessionId: null,
      reconnectAttempt: 0,
      message: 'Отключение…',
    });

    const transport = this.transport;
    this.transport = null;
    if (transport) await transport.close();

    this.updateConnection({
      phase: 'idle',
      sessionId: null,
      reconnectAttempt: 0,
      message: this.points.size > 0
        ? 'Отключено. Значения в таблице устарели.'
        : 'Соединение не установлено.',
    });
    return { ...this.connection };
  }

  async sendCommand(command: SendCommandInput): Promise<CommandResult> {
    const validated = validateCommandInput(command);
    if (this.connection.phase !== 'connected' || !this.transport) {
      throw new Error('Сначала подключитесь к Java-серверу.');
    }
    return this.transport.sendCommand(validated);
  }

  onConnectionChanged(listener: (snapshot: ConnectionSnapshot) => void): () => void {
    this.events.on('connection', listener);
    return () => this.events.off('connection', listener);
  }

  onTelemetryReceived(listener: (batch: TelemetryBatch) => void): () => void {
    this.events.on('telemetry', listener);
    return () => this.events.off('telemetry', listener);
  }

  private async performConnect(generation: number, address: string): Promise<void> {
    if (!this.desiredConnected || generation !== this.generation) return;

    const telemetryGeneration = ++this.telemetryGeneration;
    let transport: ScadaTransport;
    transport = this.transportFactory({
      onTelemetry: (points) => this.handleTelemetry(
        generation,
        telemetryGeneration,
        transport,
        points,
      ),
      onTerminated: (error) => this.handleTerminal(generation, transport, error),
    });
    this.transport = transport;

    try {
      const sessionId = await transport.connect(address);
      if (!this.desiredConnected || generation !== this.generation || this.transport !== transport) {
        await transport.close();
        return;
      }

      this.updateConnection({
        phase: 'connected',
        sessionId,
        telemetryGeneration,
        reconnectAttempt: 0,
        message: `Подключено к ${address}.`,
      });
      this.stableTimer = this.scheduler.set(() => {
        if (generation === this.generation && this.transport === transport) {
          this.reconnectAttempt = 0;
        }
      }, STABLE_CONNECTION_MS);
    } catch (error) {
      if (this.transport === transport) this.transport = null;
      await transport.close();
      if (this.desiredConnected && generation === this.generation) {
        this.scheduleReconnect(generation, address, toError(error));
      }
    }
  }

  private handleTelemetry(
    generation: number,
    telemetryGeneration: number,
    transport: ScadaTransport,
    points: TelemetryPoint[],
  ): void {
    if (
      points.length === 0
      || generation !== this.generation
      || transport !== this.transport
      || !this.desiredConnected
    ) return;

    this.localSequence += 1;
    const stampedPoints = points.map((point) => ({ ...point, telemetryGeneration }));
    for (const point of stampedPoints) {
      this.points.set(point.id, point);
      this.recentEvents.unshift({ ...point, localSequence: this.localSequence });
    }
    if (this.recentEvents.length > EVENT_LIMIT) this.recentEvents.length = EVENT_LIMIT;

    this.emitTelemetry({
      localSequence: this.localSequence,
      receivedAt: stampedPoints[0]?.receivedAt ?? this.now().toISOString(),
      points: stampedPoints,
      reset: false,
    });
  }

  private handleTerminal(
    generation: number,
    transport: ScadaTransport,
    error: Error,
  ): void {
    if (
      !this.desiredConnected
      || generation !== this.generation
      || transport !== this.transport
    ) return;

    this.transport = null;
    if (this.stableTimer) {
      this.scheduler.clear(this.stableTimer);
      this.stableTimer = null;
    }
    void transport.close();
    this.scheduleReconnect(generation, this.connection.address, error);
  }

  private scheduleReconnect(generation: number, address: string, error: Error): void {
    if (!this.desiredConnected || generation !== this.generation || this.reconnectTimer) return;

    this.reconnectAttempt += 1;
    const baseDelay = RECONNECT_DELAYS_MS[
      Math.min(this.reconnectAttempt - 1, RECONNECT_DELAYS_MS.length - 1)
    ];
    const jitter = Math.round(baseDelay * 0.2 * (this.random() * 2 - 1));
    const delay = Math.max(500, baseDelay + jitter);

    this.updateConnection({
      phase: 'reconnecting',
      sessionId: null,
      reconnectAttempt: this.reconnectAttempt,
      message: `Связь потеряна: ${error.message} Повтор через ${Math.ceil(delay / 1_000)} с.`,
    });
    this.reconnectTimer = this.scheduler.set(() => {
      this.reconnectTimer = null;
      if (!this.desiredConnected || generation !== this.generation) return;
      this.updateConnection({
        phase: 'connecting',
        sessionId: null,
        reconnectAttempt: this.reconnectAttempt,
        message: `Повторное подключение к ${address}…`,
      });
      void this.performConnect(generation, address);
    }, delay);
  }

  private cancelTimers(): void {
    if (this.reconnectTimer) this.scheduler.clear(this.reconnectTimer);
    if (this.stableTimer) this.scheduler.clear(this.stableTimer);
    this.reconnectTimer = null;
    this.stableTimer = null;
  }

  private updateConnection(update: Partial<ConnectionSnapshot>): void {
    this.connection = {
      ...this.connection,
      ...update,
      changedAt: this.now().toISOString(),
    };
    this.events.emit('connection', { ...this.connection });
  }

  private emitTelemetry(batch: TelemetryBatch): void {
    this.events.emit('telemetry', batch);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

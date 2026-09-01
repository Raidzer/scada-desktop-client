export const RECEIVER_SESSION_ID = '00000000-0000-1000-a000-000000000001';

export const IPC_CHANNELS = {
  getBootstrap: 'scada:get-bootstrap',
  connect: 'scada:connect',
  disconnect: 'scada:disconnect',
  sendCommand: 'scada:send-command',
  connectionChanged: 'scada:connection-changed',
  telemetryReceived: 'scada:telemetry-received',
} as const;

export type ConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'error';

export interface ConnectionSnapshot {
  phase: ConnectionPhase;
  address: string;
  sessionId: string | null;
  telemetryGeneration: number;
  reconnectAttempt: number;
  message: string;
  changedAt: string;
}

export type TelemetryType = 'TI' | 'TS' | 'PTI' | 'PTS' | 'UNKNOWN';

export interface TelemetryPoint {
  id: string;
  type: TelemetryType;
  value: number | string;
  flag: number;
  lowerTime: string | null;
  upperTime: string | null;
  receivedAt: string;
  senderSessionId: string;
  receiverSessionId: string;
  /** Local connection generation; zero means the transport has not stamped the point yet. */
  telemetryGeneration: number;
}

export interface TelemetryBatch {
  localSequence: number;
  receivedAt: string;
  points: TelemetryPoint[];
  reset: boolean;
}

export interface TelemetryEvent extends TelemetryPoint {
  localSequence: number;
}

export interface SendCommandInput {
  pointId: string;
  type: 'TI' | 'TS';
  value: number;
  flag: number;
}

export interface CommandResult {
  outcome: 'accepted' | 'rejected' | 'unknown';
  responseCode: number | null;
  message: string;
  sentAt: string;
}

export interface BootstrapSnapshot {
  connection: ConnectionSnapshot;
  savedAddress: string;
  receiverSessionId: string;
  points: TelemetryPoint[];
  events: TelemetryEvent[];
}

export interface ScadaDesktopApi {
  getBootstrap(): Promise<BootstrapSnapshot>;
  connect(address: string): Promise<ConnectionSnapshot>;
  disconnect(): Promise<ConnectionSnapshot>;
  sendCommand(command: SendCommandInput): Promise<CommandResult>;
  onConnectionChanged(listener: (snapshot: ConnectionSnapshot) => void): () => void;
  onTelemetryReceived(listener: (batch: TelemetryBatch) => void): () => void;
}

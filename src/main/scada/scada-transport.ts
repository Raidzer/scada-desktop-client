import type { CommandResult, SendCommandInput, TelemetryPoint } from '../../shared/contracts';

export interface ScadaTransportCallbacks {
  onTelemetry(points: TelemetryPoint[]): void;
  onTerminated(error: Error): void;
}

export interface ScadaTransport {
  connect(address: string): Promise<string>;
  sendCommand(command: SendCommandInput): Promise<CommandResult>;
  close(): Promise<void>;
}

export type ScadaTransportFactory = (callbacks: ScadaTransportCallbacks) => ScadaTransport;

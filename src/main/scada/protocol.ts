import type { SendCommandInput, TelemetryPoint, TelemetryType } from '../../shared/contracts';
import { isUuid } from '../../shared/validation';

export interface WireTimestamp {
  seconds?: string | number;
  nanos?: number;
}

export interface WireTelemetry {
  id_tm?: string;
  lower_time?: WireTimestamp | null;
  upper_time?: WireTimestamp | null;
  type_tm?: string | number;
  value_ts?: number;
  value_ti?: number;
  value_str?: string;
  flag_tm?: number;
}

export interface WireCommand {
  scada_type_command?: string | number;
  response_from_uuid_session?: string;
  response_to_uuid_session?: string;
  scada_tm?: WireTelemetry | null;
  uuid_session?: string;
}

export interface WireCommandBatch {
  core_command?: WireCommand[];
}

export interface WireOpenSessionResponse {
  response_uuid_session?: string;
}

export interface WireResultResponse {
  response_message?: string;
  response_code?: number;
}

export function createWireTimestamp(now: Date): Required<WireTimestamp> {
  const milliseconds = now.getTime();
  return {
    seconds: Math.floor(milliseconds / 1_000).toString(),
    nanos: (milliseconds % 1_000) * 1_000_000,
  };
}

export function buildWireCommand(
  command: SendCommandInput,
  senderSessionId: string,
  receiverSessionId: string,
  now: Date,
): WireCommandBatch {
  const timestamp = createWireTimestamp(now);
  const value = command.type === 'TS'
    ? { value_ts: command.value }
    : { value_ti: command.value };

  return {
    core_command: [
      {
        scada_type_command: 'CHANGE_TM',
        response_from_uuid_session: senderSessionId,
        response_to_uuid_session: receiverSessionId,
        scada_tm: {
          id_tm: command.pointId,
          lower_time: timestamp,
          upper_time: timestamp,
          type_tm: command.type,
          flag_tm: command.flag,
          ...value,
        },
      },
    ],
  };
}

export function mapWireBatch(batch: WireCommandBatch, receivedAt = new Date()): TelemetryPoint[] {
  if (!Array.isArray(batch.core_command) || batch.core_command.length === 0) {
    return [];
  }

  const receivedAtIso = receivedAt.toISOString();
  const points: TelemetryPoint[] = [];

  for (const wireCommand of batch.core_command) {
    const wireTelemetry = wireCommand?.scada_tm;
    if (!wireTelemetry || typeof wireTelemetry.id_tm !== 'string' || !isUuid(wireTelemetry.id_tm)) {
      continue;
    }

    const type = normalizeTelemetryType(wireTelemetry.type_tm);
    if (type !== 'TI' && type !== 'TS') {
      continue;
    }

    const value = type === 'TS' ? wireTelemetry.value_ts : wireTelemetry.value_ti;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    const rawFlag = Number(wireTelemetry.flag_tm ?? 0);
    if (!Number.isInteger(rawFlag)) {
      continue;
    }

    points.push({
      id: wireTelemetry.id_tm.toLowerCase(),
      type,
      value,
      flag: normalizeSigned16(rawFlag),
      lowerTime: wireTimestampToIso(wireTelemetry.lower_time),
      upperTime: wireTimestampToIso(wireTelemetry.upper_time),
      receivedAt: receivedAtIso,
      senderSessionId: stringOrEmpty(wireCommand.response_from_uuid_session),
      receiverSessionId: stringOrEmpty(wireCommand.response_to_uuid_session),
      telemetryGeneration: 0,
    });
  }

  return points;
}

function normalizeTelemetryType(value: string | number | undefined): TelemetryType {
  if (value === undefined || value === 0 || value === 'TI') return 'TI';
  if (value === 1 || value === 'TS') return 'TS';
  if (value === 2 || value === 'PTI') return 'PTI';
  if (value === 3 || value === 'PTS') return 'PTS';
  return 'UNKNOWN';
}

function normalizeSigned16(value: number): number {
  const bits = value & 0xffff;
  return bits > 0x7fff ? bits - 0x10000 : bits;
}

function wireTimestampToIso(timestamp: WireTimestamp | null | undefined): string | null {
  if (!timestamp) return null;

  const seconds = Number(timestamp.seconds ?? 0);
  const nanos = Number(timestamp.nanos ?? 0);
  if (!Number.isFinite(seconds) || !Number.isFinite(nanos)) return null;

  const milliseconds = seconds * 1_000 + Math.floor(nanos / 1_000_000);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

import type { SendCommandInput } from './contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function parseServerAddress(value: string): string {
  const trimmed = value.trim();
  const match = /^(?:\[([0-9a-f:.]+)\]|([^:\s/]+)):(\d{1,5})$/i.exec(trimmed);

  if (!match) {
    throw new ValidationError('Введите адрес в формате host:port, например 127.0.0.1:9090.');
  }

  const host = match[1] ?? match[2];
  const port = Number(match[3]);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ValidationError('Порт должен быть целым числом от 1 до 65535.');
  }

  return `${match[1] ? `[${host}]` : host}:${port}`;
}

export function parseFlagInput(value: string): number {
  const trimmed = value.trim();
  const isHex = /^0x[0-9a-f]+$/i.test(trimmed);
  const isDecimal = /^-?\d+$/.test(trimmed);

  if (!isHex && !isDecimal) {
    throw new ValidationError('Флаг должен быть десятичным числом или hex в формате 0xFFFF.');
  }

  const parsed = Number.parseInt(trimmed, isHex ? 16 : 10);
  if (!Number.isInteger(parsed) || parsed < -32_768 || parsed > 65_535) {
    throw new ValidationError('Флаг должен быть в диапазоне -32768…65535 (16 бит).');
  }

  return parsed > 32_767 ? parsed - 65_536 : parsed;
}

export function toFlagHex(value: number): string {
  return `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function formatFlag(value: number): string {
  return `${value} (${toFlagHex(value)})`;
}

export function parseTelemetryValue(type: 'TI' | 'TS', value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError('Введите значение команды.');
  }

  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    throw new ValidationError('Значение должно быть конечным числом.');
  }

  if (type === 'TS' && (!Number.isInteger(parsed) || parsed < -128 || parsed > 127)) {
    throw new ValidationError('Для TS укажите целое число от -128 до 127.');
  }

  return parsed;
}

export function validateCommandInput(command: SendCommandInput): SendCommandInput {
  if (!isUuid(command.pointId)) {
    throw new ValidationError('UUID объекта имеет неверный формат.');
  }

  if (command.type !== 'TI' && command.type !== 'TS') {
    throw new ValidationError('Поддерживаются только типы TI и TS.');
  }

  const value = parseTelemetryValue(command.type, String(command.value));
  if (!Number.isInteger(command.flag) || command.flag < -32_768 || command.flag > 32_767) {
    throw new ValidationError('Нормализованный флаг должен быть знаковым 16-битным числом.');
  }

  return {
    pointId: command.pointId.trim().toLowerCase(),
    type: command.type,
    value,
    flag: command.flag,
  };
}

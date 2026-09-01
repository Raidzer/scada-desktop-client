import { describe, expect, it } from 'vitest';
import {
  formatFlag,
  isUuid,
  parseFlagInput,
  parseServerAddress,
  parseTelemetryValue,
  validateCommandInput,
  ValidationError,
} from '../../src/shared/validation';

describe('parseServerAddress', () => {
  it.each([
    ['127.0.0.1:9090', '127.0.0.1:9090'],
    [' scada.local:50051 ', 'scada.local:50051'],
    ['[::1]:9090', '[::1]:9090'],
  ])('normalizes %s', (input, expected) => {
    expect(parseServerAddress(input)).toBe(expected);
  });

  it.each(['http://localhost:9090', 'localhost', 'localhost:0', 'localhost:65536', 'host/path:90'])
    ('rejects %s', (input) => {
      expect(() => parseServerAddress(input)).toThrow(ValidationError);
    });
});

describe('UUID compatibility', () => {
  it('accepts RFC variant UUID versions supported by the Java side', () => {
    expect(isUuid('11111111-1465-4908-B935-000000000100')).toBe(true);
    expect(isUuid('00000000-0000-1000-a000-000000000001')).toBe(true);
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    '019535d9-3df7-7000-8000-000000000000',
    '11111111-1465-4908-7935-000000000100',
    'not-a-uuid',
  ])('rejects UUID outside the Java-compatible shape: %s', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('flag parsing and display', () => {
  it.each([
    ['257', 257, '257 (0x0101)'],
    ['2507', 2507, '2507 (0x09CB)'],
    ['0xFFFF', -1, '-1 (0xFFFF)'],
    ['65535', -1, '-1 (0xFFFF)'],
    ['-32768', -32768, '-32768 (0x8000)'],
  ])('parses %s as a signed Java short', (input, value, display) => {
    expect(parseFlagInput(input)).toBe(value);
    expect(formatFlag(value)).toBe(display);
  });

  it.each(['0x10000', '-32769', '12.2', 'xyz'])('rejects invalid flag %s', (input) => {
    expect(() => parseFlagInput(input)).toThrow(ValidationError);
  });
});

describe('command validation', () => {
  it('validates TS as a signed byte and normalizes the UUID', () => {
    expect(validateCommandInput({
      pointId: '11111111-1465-4908-B935-000000000100',
      type: 'TS',
      value: 127,
      flag: -1,
    })).toEqual({
      pointId: '11111111-1465-4908-b935-000000000100',
      type: 'TS',
      value: 127,
      flag: -1,
    });
  });

  it.each(['-128', '0', '127'])('accepts TS value %s', (value) => {
    expect(parseTelemetryValue('TS', value)).toBe(Number(value));
  });

  it.each(['-129', '128', '1.5'])('rejects TS value %s', (value) => {
    expect(() => parseTelemetryValue('TS', value)).toThrow(ValidationError);
  });

  it('accepts decimal comma for TI', () => {
    expect(parseTelemetryValue('TI', '12,75')).toBe(12.75);
  });
});

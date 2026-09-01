import { describe, expect, it } from 'vitest';
import { RECEIVER_SESSION_ID } from '../../../src/shared/contracts';
import { buildWireCommand, createWireTimestamp, mapWireBatch } from '../../../src/main/scada/protocol';

const SESSION_ID = '83c5b124-d12d-4a2b-8b67-fc0b425a7e22';
const POINT_ID = '11111111-1465-4908-b935-000000000100';

describe('gRPC protocol mapping', () => {
  it('builds the exact CHANGE_TM request for TS', () => {
    const now = new Date('2026-09-01T09:10:11.123Z');
    const request = buildWireCommand({
      pointId: POINT_ID,
      type: 'TS',
      value: -12,
      flag: -1,
    }, SESSION_ID, RECEIVER_SESSION_ID, now);

    expect(request).toEqual({
      core_command: [{
        scada_type_command: 'CHANGE_TM',
        response_from_uuid_session: SESSION_ID,
        response_to_uuid_session: RECEIVER_SESSION_ID,
        scada_tm: {
          id_tm: POINT_ID,
          lower_time: { seconds: '1788253811', nanos: 123_000_000 },
          upper_time: { seconds: '1788253811', nanos: 123_000_000 },
          type_tm: 'TS',
          value_ts: -12,
          flag_tm: -1,
        },
      }],
    });
  });

  it('creates protobuf timestamps without losing milliseconds', () => {
    expect(createWireTimestamp(new Date('1970-01-01T00:00:01.987Z'))).toEqual({
      seconds: '1',
      nanos: 987_000_000,
    });
  });

  it('maps TI and TS events, including proto3 enum zero defaults', () => {
    const receivedAt = new Date('2026-09-01T10:00:00.000Z');
    const points = mapWireBatch({
      core_command: [
        {
          response_from_uuid_session: SESSION_ID,
          response_to_uuid_session: RECEIVER_SESSION_ID,
          scada_tm: {
            id_tm: POINT_ID,
            type_tm: undefined,
            value_ti: 12.5,
            flag_tm: 65_535,
            lower_time: { seconds: '1788253811', nanos: 123_000_000 },
            upper_time: { seconds: '1788253812', nanos: 0 },
          },
        },
        {
          scada_tm: {
            id_tm: 'b9982b88-64fd-40dc-8c83-cf08bab00002',
            type_tm: 1,
            value_ts: 1,
            flag_tm: 257,
          },
        },
      ],
    }, receivedAt);

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      id: POINT_ID,
      type: 'TI',
      value: 12.5,
      flag: -1,
      lowerTime: '2026-09-01T09:10:11.123Z',
      upperTime: '2026-09-01T09:10:12.000Z',
      receivedAt: receivedAt.toISOString(),
    });
    expect(points[1]).toMatchObject({ type: 'TS', value: 1, flag: 257 });
  });

  it('ignores empty, unsupported and malformed commands', () => {
    expect(mapWireBatch({})).toEqual([]);
    expect(mapWireBatch({ core_command: [] })).toEqual([]);
    expect(mapWireBatch({
      core_command: [
        { scada_tm: { id_tm: POINT_ID, type_tm: 'PTI', value_ti: 1 } },
        { scada_tm: { id_tm: 'bad', type_tm: 'TS', value_ts: 1 } },
        { scada_tm: { id_tm: POINT_ID, type_tm: 'TS', value_ts: Number.NaN } },
      ],
    })).toEqual([]);
  });
});

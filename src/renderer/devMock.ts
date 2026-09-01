import type {
  ConnectionSnapshot,
  ScadaDesktopApi,
  TelemetryEvent,
  TelemetryPoint,
} from '../shared/contracts';
import { RECEIVER_SESSION_ID } from '../shared/contracts';

const SESSION_ID = '83c5b124-d12d-4a2b-8b67-fc0b425a7e22';

export function installBrowserDevMock(): void {
  let connection: ConnectionSnapshot = {
    phase: 'connected',
    address: '127.0.0.1:9090',
    sessionId: SESSION_ID,
    telemetryGeneration: 1,
    reconnectAttempt: 0,
    message: 'Подключено к 127.0.0.1:9090.',
    changedAt: new Date().toISOString(),
  };
  const points = createSamplePoints();
  const events: TelemetryEvent[] = points
    .map((point, index) => ({ ...point, localSequence: points.length - index }))
    .reverse();
  const connectionListeners = new Set<(snapshot: ConnectionSnapshot) => void>();

  const api: ScadaDesktopApi = {
    getBootstrap: async () => ({
      connection,
      savedAddress: connection.address,
      receiverSessionId: RECEIVER_SESSION_ID,
      points,
      events,
    }),
    connect: async (address) => {
      connection = {
        ...connection,
        phase: 'connected',
        address,
        sessionId: SESSION_ID,
        message: `Подключено к ${address}.`,
        changedAt: new Date().toISOString(),
      };
      connectionListeners.forEach((listener) => listener(connection));
      return connection;
    },
    disconnect: async () => {
      connection = {
        ...connection,
        phase: 'idle',
        sessionId: null,
        message: 'Отключено. Значения в таблице устарели.',
        changedAt: new Date().toISOString(),
      };
      connectionListeners.forEach((listener) => listener(connection));
      return connection;
    },
    sendCommand: async () => ({
      outcome: 'accepted',
      responseCode: 0,
      message: 'Сервер принял команду в обработку. Это не подтверждает её исполнение.',
      sentAt: new Date().toISOString(),
    }),
    onConnectionChanged: (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    onTelemetryReceived: () => () => undefined,
  };

  window.scada = api;
}

function createSamplePoints(): TelemetryPoint[] {
  const receivedAt = new Date().toISOString();
  const samples: Array<[string, 'TI' | 'TS', number, number]> = [
    ['11111111-1465-4908-b935-000000000100', 'TS', 1, 257],
    ['11111111-1465-4908-b935-000000000101', 'TS', 0, 257],
    ['11111111-1465-4908-b935-000000000201', 'TS', 1, 2507],
    ['b9982b88-64fd-40dc-8c83-cf08bab00002', 'TS', 0, -1],
    ['9bfcc046-8f08-4f83-a715-000000000001', 'TI', 100.25, 2507],
    ['fe4affeb-1465-4908-b935-cf08bab02403', 'TI', 38.714, 257],
  ];
  return samples.map(([id, type, value, flag], index) => ({
    id,
    type,
    value,
    flag,
    lowerTime: new Date(Date.now() - index * 1_250).toISOString(),
    upperTime: new Date(Date.now() - index * 1_250).toISOString(),
    receivedAt,
    senderSessionId: SESSION_ID,
    receiverSessionId: RECEIVER_SESSION_ID,
    telemetryGeneration: 1,
  }));
}

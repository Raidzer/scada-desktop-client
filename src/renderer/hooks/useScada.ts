import { startTransition, useCallback, useEffect, useState } from 'react';
import type {
  CommandResult,
  ConnectionSnapshot,
  SendCommandInput,
  TelemetryBatch,
  TelemetryEvent,
  TelemetryPoint,
} from '../../shared/contracts';

interface ScadaViewState {
  loading: boolean;
  loadError: string;
  connection: ConnectionSnapshot;
  savedAddress: string;
  receiverSessionId: string;
  points: Map<string, TelemetryPoint>;
  events: TelemetryEvent[];
  lastBatchAt: string | null;
}

const initialConnection: ConnectionSnapshot = {
  phase: 'idle',
  address: '127.0.0.1:9090',
  sessionId: null,
  telemetryGeneration: 0,
  reconnectAttempt: 0,
  message: 'Загрузка локального шлюза…',
  changedAt: new Date(0).toISOString(),
};

const initialState: ScadaViewState = {
  loading: true,
  loadError: '',
  connection: initialConnection,
  savedAddress: initialConnection.address,
  receiverSessionId: '',
  points: new Map(),
  events: [],
  lastBatchAt: null,
};

export function useScada() {
  const [state, setState] = useState<ScadaViewState>(initialState);

  useEffect(() => {
    let disposed = false;
    let ready = false;
    let queuedConnection: ConnectionSnapshot | null = null;
    const queuedBatches: TelemetryBatch[] = [];

    const unsubscribeConnection = window.scada.onConnectionChanged((connection) => {
      if (!ready) {
        queuedConnection = connection;
        return;
      }
      setState((current) => ({ ...current, connection }));
    });
    const unsubscribeTelemetry = window.scada.onTelemetryReceived((batch) => {
      if (!ready) {
        queuedBatches.push(batch);
        return;
      }
      applyTelemetryBatch(setState, batch);
    });

    void window.scada.getBootstrap()
      .then((snapshot) => {
        if (disposed) return;
        const pointMap = new Map(snapshot.points.map((point) => [point.id, point]));
        setState({
          loading: false,
          loadError: '',
          connection: queuedConnection ?? snapshot.connection,
          savedAddress: snapshot.savedAddress,
          receiverSessionId: snapshot.receiverSessionId,
          points: pointMap,
          events: snapshot.events,
          lastBatchAt: snapshot.events[0]?.receivedAt ?? null,
        });
        ready = true;
        for (const batch of queuedBatches) applyTelemetryBatch(setState, batch);
        queuedBatches.length = 0;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        ready = true;
        setState((current) => ({
          ...current,
          loading: false,
          loadError: toDisplayError(error),
        }));
      });

    return () => {
      disposed = true;
      unsubscribeConnection();
      unsubscribeTelemetry();
    };
  }, []);

  const connect = useCallback(async (address: string) => {
    const connection = await window.scada.connect(address);
    setState((current) => ({ ...current, connection, savedAddress: connection.address }));
    return connection;
  }, []);

  const disconnect = useCallback(async () => {
    const connection = await window.scada.disconnect();
    setState((current) => ({ ...current, connection }));
    return connection;
  }, []);

  const sendCommand = useCallback((command: SendCommandInput): Promise<CommandResult> => (
    window.scada.sendCommand(command)
  ), []);

  return { state, connect, disconnect, sendCommand };
}

function applyTelemetryBatch(
  setState: React.Dispatch<React.SetStateAction<ScadaViewState>>,
  batch: TelemetryBatch,
): void {
  startTransition(() => {
    setState((current) => {
      const points = batch.reset ? new Map<string, TelemetryPoint>() : new Map(current.points);
      for (const point of batch.points) points.set(point.id, point);

      const incomingEvents = [...batch.points]
        .reverse()
        .map((point) => ({ ...point, localSequence: batch.localSequence }));
      const events = batch.reset
        ? incomingEvents
        : [...incomingEvents, ...current.events].slice(0, 250);

      return {
        ...current,
        points,
        events,
        lastBatchAt: batch.reset ? null : batch.receivedAt,
      };
    });
  });
}

export function toDisplayError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

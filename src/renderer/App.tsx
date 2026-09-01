import { Info } from '@phosphor-icons/react/Info';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { CommandForm } from './components/CommandForm';
import { ConnectionPanel } from './components/ConnectionPanel';
import { EventLog } from './components/EventLog';
import { StatusRail } from './components/StatusRail';
import { TelemetryTable } from './components/TelemetryTable';
import { useScada } from './hooks/useScada';

export function App() {
  const { state, connect, disconnect, sendCommand } = useScada();
  const connected = state.connection.phase === 'connected';

  if (state.loading) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-mark" aria-hidden="true" />
        <strong>Запуск SCADA Desktop</strong>
        <span>Инициализация локального шлюза…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <StatusRail
        connection={state.connection}
        pointCount={state.points.size}
        lastBatchAt={state.lastBatchAt}
      />

      <main id="main-content" className="main-content">
        {state.loadError && (
          <div className="inline-alert inline-alert--danger" role="alert">
            <WarningCircle size={20} aria-hidden="true" />
            Не удалось загрузить состояние приложения: {state.loadError}
          </div>
        )}

        <ConnectionPanel
          connection={state.connection}
          savedAddress={state.savedAddress}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        <div className="prototype-notice">
          <Info size={20} aria-hidden="true" />
          <span>
            <strong>Режим без начального снимка.</strong>{' '}
            Таблица содержит только события, пришедшие после подключения. Значения не очищаются при
            автоматическом reconnect, но считаются устаревшими до следующего события.
          </span>
        </div>

        <div className="workspace-grid">
          <TelemetryTable
            points={state.points}
            connected={connected}
            telemetryGeneration={state.connection.telemetryGeneration}
          />
          <CommandForm
            connected={connected}
            receiverSessionId={state.receiverSessionId}
            onSend={sendCommand}
          />
        </div>

        <EventLog events={state.events} />
      </main>

      <footer className="app-footer">
        <span>SCADA Desktop · прототип</span>
        <span>Хранилище: оперативная память · протокол: gRPC plaintext</span>
      </footer>
    </div>
  );
}

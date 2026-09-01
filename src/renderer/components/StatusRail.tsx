import { Clock } from '@phosphor-icons/react/Clock';
import { Database } from '@phosphor-icons/react/Database';
import { Plug } from '@phosphor-icons/react/Plug';
import { Pulse } from '@phosphor-icons/react/Pulse';
import type { ConnectionSnapshot } from '../../shared/contracts';

interface StatusRailProps {
  connection: ConnectionSnapshot;
  pointCount: number;
  lastBatchAt: string | null;
}

const phaseLabels: Record<ConnectionSnapshot['phase'], string> = {
  idle: 'Отключено',
  connecting: 'Подключение',
  connected: 'В сети',
  reconnecting: 'Переподключение',
  disconnecting: 'Отключение',
  error: 'Ошибка',
};

export function StatusRail({ connection, pointCount, lastBatchAt }: StatusRailProps) {
  return (
    <header className="status-rail">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true"><Pulse size={22} weight="bold" /></span>
        <span>
          <strong>SCADA Desktop</strong>
          <small>операторский прототип</small>
        </span>
      </div>

      <div className="status-cluster" aria-label="Сводка состояния">
        <StatusItem
          icon={<Plug size={18} />}
          label="Связь"
          value={phaseLabels[connection.phase]}
          tone={connection.phase}
        />
        <StatusItem
          icon={<Database size={18} />}
          label="Объектов"
          value={pointCount.toLocaleString('ru-RU')}
        />
        <StatusItem
          icon={<Clock size={18} />}
          label="Последний пакет"
          value={lastBatchAt ? formatRailTime(lastBatchAt) : '—'}
          title={lastBatchAt ? formatFullTime(lastBatchAt) : undefined}
        />
      </div>
    </header>
  );
}

function StatusItem({
  icon,
  label,
  value,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: ConnectionSnapshot['phase'];
  title?: string;
}) {
  return (
    <div className={`status-item ${tone ? `status-item--${tone}` : ''}`} title={title}>
      <span className="status-item__icon" aria-hidden="true">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function formatRailTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatFullTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

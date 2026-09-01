import type { TelemetryEvent } from '../../shared/contracts';
import { formatFlag } from '../../shared/validation';
import { formatTime } from './TelemetryTable';

interface EventLogProps {
  events: TelemetryEvent[];
}

export function EventLog({ events }: EventLogProps) {
  return (
    <section className="panel event-panel" aria-labelledby="event-title">
      <div className="panel-heading panel-heading--horizontal">
        <div>
          <span className="eyebrow">Диагностика потока</span>
          <h2 id="event-title">Последние события</h2>
        </div>
        <span className="table-count">Хранится в памяти: {events.length} / 250</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <strong>Журнал пуст</strong>
          <span>Здесь появятся только новые события после подключения.</span>
        </div>
      ) : (
        <ol className="event-list">
          {events.slice(0, 100).map((event, index) => (
            <li key={`${event.localSequence}-${event.id}-${index}`}>
              <time dateTime={event.receivedAt}>{formatTime(event.receivedAt)}</time>
              <span className={`type-badge type-badge--${event.type.toLowerCase()}`}>{event.type}</span>
              <code title={event.id}>{event.id}</code>
              <span className="event-value">{String(event.value)}</span>
              <span className="event-flag">{formatFlag(event.flag)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

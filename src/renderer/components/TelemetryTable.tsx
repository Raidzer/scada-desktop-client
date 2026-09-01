import { CaretLeft } from '@phosphor-icons/react/CaretLeft';
import { CaretRight } from '@phosphor-icons/react/CaretRight';
import { MagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { useEffect, useMemo, useState } from 'react';
import type { TelemetryPoint } from '../../shared/contracts';
import { formatFlag } from '../../shared/validation';

const PAGE_SIZE = 30;

interface TelemetryTableProps {
  points: Map<string, TelemetryPoint>;
  connected: boolean;
  telemetryGeneration: number;
}

export function TelemetryTable({ points, connected, telemetryGeneration }: TelemetryTableProps) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return [...points.values()]
      .filter((point) => !query || point.id.includes(query) || point.type.toLowerCase().includes(query))
      .sort((left, right) => left.id.localeCompare(right.id));
  }, [filter, points]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const freshCount = connected
    ? [...points.values()].filter((point) => point.telemetryGeneration === telemetryGeneration).length
    : 0;
  const staleCount = points.size - freshCount;
  const allFresh = connected && staleCount === 0;

  useEffect(() => setPage(0), [filter]);
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  return (
    <section className="panel telemetry-panel" aria-labelledby="telemetry-title">
      <div className="panel-heading panel-heading--with-tools">
        <div>
          <span className="eyebrow">Текущее состояние</span>
          <h2 id="telemetry-title">Объекты телеметрии</h2>
        </div>
        <span className={`freshness-chip ${allFresh ? '' : 'freshness-chip--stale'}`}>
          {freshnessLabel(connected, freshCount, staleCount)}
        </span>
      </div>

      <div className="table-toolbar">
        <div className="field field--compact search-field">
          <label htmlFor="point-filter">Фильтр по UUID или типу</label>
          <span className="input-with-icon">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              id="point-filter"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Начните вводить UUID"
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </div>
        <span className="table-count">Найдено: {filtered.length.toLocaleString('ru-RU')}</span>
      </div>

      <div className="table-scroll" tabIndex={0} aria-label="Прокручиваемая таблица телеметрии">
        <table>
          <caption className="visually-hidden">Последние полученные значения объектов телеметрии</caption>
          <thead>
            <tr>
              <th scope="col">Тип</th>
              <th scope="col">UUID объекта</th>
              <th scope="col">Значение</th>
              <th scope="col">Флаг</th>
              <th scope="col">Время ТМ</th>
              <th scope="col">Получено</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((point) => {
              const stale = !connected || point.telemetryGeneration !== telemetryGeneration;
              return (
              <tr key={point.id} className={stale ? 'telemetry-row--stale' : undefined}>
                <td><span className={`type-badge type-badge--${point.type.toLowerCase()}`}>{point.type}</span></td>
                <td><code className="uuid-cell" title={point.id}>{point.id}</code></td>
                <td className="numeric-cell">{formatValue(point.value)}</td>
                <td className="numeric-cell">{formatFlag(point.flag)}</td>
                <td className="time-cell">{formatTime(point.lowerTime)}</td>
                <td className="time-cell">
                  {formatTime(point.receivedAt)}
                  {stale && <span className="row-stale-label">устарело</span>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="empty-state">
            <strong>{points.size === 0 ? 'События ещё не получены' : 'По фильтру ничего не найдено'}</strong>
            <span>{points.size === 0
              ? 'После подключения новые TI/TS появятся здесь.'
              : 'Измените UUID или тип в поле фильтра.'}</span>
          </div>
        )}
      </div>

      <div className="pagination" aria-label="Навигация по страницам таблицы">
        <button
          className="button button--quiet"
          type="button"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
        >
          <CaretLeft size={17} aria-hidden="true" /> Назад
        </button>
        <span>Страница {page + 1} из {pageCount}</span>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          disabled={page >= pageCount - 1}
        >
          Далее <CaretRight size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function freshnessLabel(connected: boolean, freshCount: number, staleCount: number): string {
  if (!connected) return staleCount > 0 ? `Устарело: ${staleCount}` : 'Нет данных';
  if (staleCount === 0) return freshCount > 0 ? `Свежих: ${freshCount}` : 'Ожидание событий';
  return `Свежих: ${freshCount} · устарело: ${staleCount}`;
}

export function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(date);
}

function formatValue(value: number | string): string {
  return typeof value === 'number' ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(value) : value;
}

import { Plug } from '@phosphor-icons/react/Plug';
import { SpinnerGap } from '@phosphor-icons/react/SpinnerGap';
import { useEffect, useState } from 'react';
import type { ConnectionSnapshot } from '../../shared/contracts';
import { parseServerAddress } from '../../shared/validation';
import { toDisplayError } from '../hooks/useScada';

interface ConnectionPanelProps {
  connection: ConnectionSnapshot;
  savedAddress: string;
  onConnect(address: string): Promise<ConnectionSnapshot>;
  onDisconnect(): Promise<ConnectionSnapshot>;
}

export function ConnectionPanel({
  connection,
  savedAddress,
  onConnect,
  onDisconnect,
}: ConnectionPanelProps) {
  const [address, setAddress] = useState(savedAddress);
  const [fieldError, setFieldError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const isActive = connection.phase !== 'idle' && connection.phase !== 'error';

  useEffect(() => setAddress(savedAddress), [savedAddress]);

  const validate = (): string | null => {
    try {
      const normalized = parseServerAddress(address);
      setFieldError('');
      return normalized;
    } catch (error) {
      setFieldError(toDisplayError(error));
      return null;
    }
  };

  const handleConnect = async () => {
    const normalized = validate();
    if (!normalized) return;
    setPending(true);
    setActionError('');
    try {
      await onConnect(normalized);
    } catch (error) {
      setActionError(toDisplayError(error));
    } finally {
      setPending(false);
    }
  };

  const handleDisconnect = async () => {
    setPending(true);
    setActionError('');
    try {
      await onDisconnect();
    } catch (error) {
      setActionError(toDisplayError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="connection-panel" aria-labelledby="connection-title">
      <div className="connection-panel__heading">
        <div>
          <span className="eyebrow">Канал данных</span>
          <h1 id="connection-title">Подключение к Java-серверу</h1>
        </div>
        <span className={`phase-chip phase-chip--${connection.phase}`}>
          <span className="phase-dot" aria-hidden="true" />
          {phaseTitle(connection.phase)}
        </span>
      </div>

      <div className="connection-controls">
        <div className="field connection-address">
          <label htmlFor="server-address">Адрес сервера</label>
          <input
            id="server-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onBlur={validate}
            disabled={pending || isActive}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'server-address-error' : 'server-address-help'}
            autoComplete="off"
            spellCheck={false}
          />
          {fieldError ? (
            <span className="field-error" id="server-address-error" role="alert">{fieldError}</span>
          ) : (
            <span className="field-help" id="server-address-help">Формат: host:port, соединение без TLS</span>
          )}
        </div>

        <button
          className={isActive ? 'button button--secondary' : 'button button--primary'}
          type="button"
          onClick={() => void (isActive ? handleDisconnect() : handleConnect())}
          disabled={pending}
        >
          {pending ? <SpinnerGap className="spin" size={19} aria-hidden="true" /> : <Plug size={19} aria-hidden="true" />}
          {isActive ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>

      <div className="connection-details" aria-live="polite" aria-atomic="true">
        <span>{connection.message}</span>
        <span className="session-readout">
          <span>Сессия</span>
          <code title={connection.sessionId ?? 'Нет активной сессии'}>
            {connection.sessionId ?? '—'}
          </code>
        </span>
      </div>
      {actionError && <p className="inline-alert inline-alert--danger" role="alert">{actionError}</p>}
    </section>
  );
}

function phaseTitle(phase: ConnectionSnapshot['phase']): string {
  const titles: Record<ConnectionSnapshot['phase'], string> = {
    idle: 'Отключено',
    connecting: 'Подключение',
    connected: 'В сети',
    reconnecting: 'Повтор связи',
    disconnecting: 'Отключение',
    error: 'Ошибка',
  };
  return titles[phase];
}

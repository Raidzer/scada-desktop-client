import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { PaperPlaneTilt } from '@phosphor-icons/react/PaperPlaneTilt';
import { SpinnerGap } from '@phosphor-icons/react/SpinnerGap';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { XCircle } from '@phosphor-icons/react/XCircle';
import { useMemo, useState } from 'react';
import type { CommandResult, SendCommandInput } from '../../shared/contracts';
import {
  isUuid,
  parseFlagInput,
  parseTelemetryValue,
  toFlagHex,
} from '../../shared/validation';
import { toDisplayError } from '../hooks/useScada';

interface CommandFormProps {
  connected: boolean;
  receiverSessionId: string;
  onSend(command: SendCommandInput): Promise<CommandResult>;
}

interface FormErrors {
  pointId?: string;
  value?: string;
  flag?: string;
}

export function CommandForm({ connected, receiverSessionId, onSend }: CommandFormProps) {
  const [pointId, setPointId] = useState('');
  const [type, setType] = useState<'TI' | 'TS'>('TS');
  const [value, setValue] = useState('');
  const [flag, setFlag] = useState('257');
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [submitError, setSubmitError] = useState('');

  const flagPreview = useMemo(() => {
    try {
      const parsed = parseFlagInput(flag);
      return `${parsed} (${toFlagHex(parsed)})`;
    } catch {
      return '—';
    }
  }, [flag]);

  const validateField = (field: keyof FormErrors): boolean => {
    try {
      if (field === 'pointId' && !isUuid(pointId)) throw new Error('Введите UUID v1–v5 в стандартном формате.');
      if (field === 'value') parseTelemetryValue(type, value);
      if (field === 'flag') parseFlagInput(flag);
      setErrors((current) => ({ ...current, [field]: undefined }));
      return true;
    } catch (error) {
      setErrors((current) => ({ ...current, [field]: toDisplayError(error) }));
      return false;
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pointValid = validateField('pointId');
    const valueValid = validateField('value');
    const flagValid = validateField('flag');
    if (!pointValid || !valueValid || !flagValid) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }

    setPending(true);
    setResult(null);
    setSubmitError('');
    try {
      const command: SendCommandInput = {
        pointId: pointId.trim().toLowerCase(),
        type,
        value: parseTelemetryValue(type, value),
        flag: parseFlagInput(flag),
      };
      setResult(await onSend(command));
    } catch (error) {
      setSubmitError(toDisplayError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel command-panel" aria-labelledby="command-title">
      <div className="panel-heading">
        <span className="eyebrow">Управление</span>
        <h2 id="command-title">Отправить CHANGE_TM</h2>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={pending}>
          <legend className="visually-hidden">Параметры команды изменения телеметрии</legend>

          <div className="field">
            <label htmlFor="command-point">UUID объекта</label>
            <input
              id="command-point"
              value={pointId}
              onChange={(event) => setPointId(event.target.value)}
              onBlur={() => validateField('pointId')}
              aria-invalid={Boolean(errors.pointId)}
              aria-describedby={errors.pointId ? 'command-point-error' : 'command-point-help'}
              placeholder="11111111-1465-4908-b935-000000000100"
              autoComplete="off"
              spellCheck={false}
            />
            {errors.pointId ? (
              <span id="command-point-error" className="field-error" role="alert">{errors.pointId}</span>
            ) : (
              <span id="command-point-help" className="field-help">Идентификатор TI/TS на Java-сервере</span>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="command-type">Тип ТМ</label>
              <select
                id="command-type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as 'TI' | 'TS');
                  setErrors((current) => ({ ...current, value: undefined }));
                }}
              >
                <option value="TS">TS · целое</option>
                <option value="TI">TI · double</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="command-value">Значение</label>
              <input
                id="command-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => validateField('value')}
                aria-invalid={Boolean(errors.value)}
                aria-describedby={errors.value ? 'command-value-error' : 'command-value-help'}
                inputMode="decimal"
                placeholder={type === 'TS' ? '0…127' : '0.0'}
                autoComplete="off"
              />
              {errors.value ? (
                <span id="command-value-error" className="field-error" role="alert">{errors.value}</span>
              ) : (
                <span id="command-value-help" className="field-help">
                  {type === 'TS' ? 'Целое от -128 до 127' : 'Конечное число double'}
                </span>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="command-flag">Флаг состояния</label>
            <input
              id="command-flag"
              value={flag}
              onChange={(event) => setFlag(event.target.value)}
              onBlur={() => validateField('flag')}
              aria-invalid={Boolean(errors.flag)}
              aria-describedby={errors.flag ? 'command-flag-error' : 'command-flag-help'}
              inputMode="text"
              autoComplete="off"
            />
            {errors.flag ? (
              <span id="command-flag-error" className="field-error" role="alert">{errors.flag}</span>
            ) : (
              <span id="command-flag-help" className="field-help">
                Decimal или hex. Будет передано: <code>{flagPreview}</code>
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="command-receiver">Получатель · фиксирован в прототипе</label>
            <input
              id="command-receiver"
              className="read-only-input"
              value={receiverSessionId}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
            />
          </div>

          <button className="button button--primary button--full" type="submit" disabled={!connected || pending}>
            {pending ? <SpinnerGap className="spin" size={19} aria-hidden="true" /> : <PaperPlaneTilt size={19} aria-hidden="true" />}
            {pending ? 'Отправка…' : 'Передать команду'}
          </button>
          {!connected && <p className="form-note">Кнопка станет доступна после подключения.</p>}
        </fieldset>
      </form>

      <div className="command-feedback" aria-live="polite" aria-atomic="true">
        {result && <ResultMessage result={result} />}
        {submitError && (
          <p className="inline-alert inline-alert--danger">
            <XCircle size={19} aria-hidden="true" /> {submitError}
          </p>
        )}
      </div>
    </section>
  );
}

function ResultMessage({ result }: { result: CommandResult }) {
  const config = {
    accepted: { className: 'success', icon: <CheckCircle size={19} aria-hidden="true" />, title: 'Принято сервером' },
    rejected: { className: 'danger', icon: <XCircle size={19} aria-hidden="true" />, title: 'Отклонено сервером' },
    unknown: { className: 'warning', icon: <WarningCircle size={19} aria-hidden="true" />, title: 'Результат неизвестен' },
  }[result.outcome];

  return (
    <div className={`result-card result-card--${config.className}`}>
      <span>{config.icon}</span>
      <span>
        <strong>{config.title}</strong>
        <small>{result.message}</small>
      </span>
    </div>
  );
}

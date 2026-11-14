import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { getLang, tf } from '../i18n';
import { formatInput, parseNumber, sameNumber } from '../lib/numberInput';
import styles from './NumberField.module.css';

interface Props {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  error?: string | undefined;
  disabled?: boolean | undefined;
  onChange: (value: number) => void;
  onCommit: (moveFocus: boolean) => void;
}

export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  error,
  disabled = false,
  onChange,
  onCommit,
}: Props) {
  const lang = getLang();
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState(() => formatInput(value, lang));

  useEffect(() => {
    if (!sameNumber(parseNumber(text), value)) setText(formatInput(value, lang));
  }, [value, lang]);

  const sliderValue = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(true);
    }
  }

  return (
    <div className={styles.root} data-disabled={disabled ? '' : undefined}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        aria-label={tf('plan.slider', { label }, lang)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className={styles.entry}>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={styles.input}
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setText(event.target.value);
            onChange(parseNumber(event.target.value));
          }}
          onBlur={() => onCommit(false)}
          onKeyDown={onKeyDown}
        />
        <span className={styles.unit}>{unit}</span>
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

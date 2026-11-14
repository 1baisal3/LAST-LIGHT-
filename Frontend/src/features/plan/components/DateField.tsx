import { useId } from 'react';
import { getLang, t } from '../../../shared/i18n';
import { formatDate } from '../../../shared/lib/format';
import type { Site } from '../../../sim/types';
import styles from './DateField.module.css';

interface Props {
  site: Site;
  starts: number[];
  value: number;
  error?: string | undefined;
  onChange: (startIndex: number) => void;
}

export function DateField({ site, starts, value, error, onChange }: Props) {
  const lang = getLang();
  const selectId = useId();
  const errorId = useId();
  const known = starts.includes(value);

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={selectId}>
        {t('plan.date')}
      </label>
      <div className={styles.row}>
        <select
          id={selectId}
          className={styles.select}
          value={known ? value : ''}
          disabled={starts.length === 0}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {known ? null : <option value="" />}
          {starts.map((start) => (
            <option key={start} value={start}>
              {formatDate(site.hours[start]!.t, lang)}
            </option>
          ))}
        </select>
        <span className={styles.utc}>{t('plan.utc')}</span>
      </div>
      {starts.length === 0 ? <p className={styles.error}>{t('plan.noStarts')}</p> : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

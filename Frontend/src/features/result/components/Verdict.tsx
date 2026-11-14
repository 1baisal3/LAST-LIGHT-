import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../../app/store';
import { t } from '../../../shared/i18n';
import { hourSelected } from '../../timeline/viewSlice';
import { describeVerdict, type VerdictModel } from '../verdictModel';
import styles from './Verdict.module.css';

const ICON = { none: '…', ok: '●', fail: '✕', error: '!' } as const;

interface ViewProps {
  model: VerdictModel;
  onShowHour: (hour: number) => void;
}

export function VerdictView({ model, onShowHour }: ViewProps) {
  return (
    <section
      className={`${styles.root} ${styles[model.kind] ?? ''} ${model.stale ? styles.stale : ''}`}
      data-kind={model.kind}
      data-stale={model.stale ? '' : undefined}
      aria-label={model.label}
      aria-live="polite"
      aria-busy={model.busy}
    >
      <p className={styles.title}>
        <span aria-hidden="true">{ICON[model.kind]}</span>
        {model.title}
      </p>

      {model.busy ? (
        <p className={styles.busy} role="status">
          {t('verdict.running')}
        </p>
      ) : null}

      {model.detail ? <p className={styles.detail}>{model.detail}</p> : null}

      {model.kind === 'fail' ? (
        <dl className={styles.facts}>
          {model.time ? (
            <div className={styles.fact}>
              <dt>{t('verdict.time')}</dt>
              <dd>{model.time}</dd>
            </div>
          ) : null}
          <div className={styles.fact}>
            <dt>{t('verdict.reason')}</dt>
            <dd>{model.reason}</dd>
          </div>
        </dl>
      ) : null}

      {model.hour !== null ? (
        <button type="button" className={styles.show} onClick={() => onShowHour(model.hour!)}>
          {t('verdict.showHour')}
        </button>
      ) : null}
    </section>
  );
}

export function Verdict() {
  const dispatch = useDispatch();
  const { status, result, error } = useSelector((state: RootState) => state.result);
  const startIndex = useSelector((state: RootState) => state.plan.plan.startIndex);
  const windowStart = useSelector(
    (state: RootState) => state.dataset.dataset?.sites.window.start ?? null,
  );

  const model = describeVerdict({ status, result, error, startIndex, windowStart });

  return <VerdictView model={model} onShowHour={(hour) => dispatch(hourSelected(hour))} />;
}

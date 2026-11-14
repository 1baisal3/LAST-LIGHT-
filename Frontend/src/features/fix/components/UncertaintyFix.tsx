import { useAppDispatch, useAppSelector } from '../../../app/store';
import { t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber, formatPct } from '../../../shared/lib/format';
import { uncertaintyRequested } from '../uncertaintySlice';
import styles from './FixPanel.module.css';

interface Props {
  lang: Lang;
  ready: boolean;
}

export function UncertaintyFix({ lang, ready }: Props) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.uncertainty);
  const searching = state.status === 'searching';
  const answered = state.status === 'answered';
  const answer = answered ? state.answer : null;

  let message: string | null = null;
  let bad = false;
  if (!ready && state.status === 'idle') message = t('fix.needResult', lang);
  if (searching) message = t('fix.uncSearching', lang);
  if (state.status === 'error') {
    message = t('fix.error', lang);
    bad = true;
  }
  if (answered && !answer) message = t('fix.uncMastOnly', lang);
  if (answer) {
    message = tf(
      'fix.uncSurvived',
      { survived: answer.survived, total: answer.total, pct: formatPct(answer.passRate * 100, lang, 0) },
      lang,
    );
    bad = answer.survived < answer.total;
  }

  return (
    <div className={styles.body} aria-busy={searching}>
      <p className={styles.hint}>{t('fix.uncHint', lang)}</p>
      <button
        type="button"
        className={styles.search}
        disabled={!ready || searching}
        onClick={() => dispatch(uncertaintyRequested())}
      >
        {t('fix.uncFind', lang)}
      </button>
      <p className={bad ? `${styles.status} ${styles.bad}` : styles.status} role="status">
        {message}
      </p>
      {answer?.failureHour ? (
        <p className={styles.status}>
          {tf(
            'fix.uncHours',
            {
              min: formatNumber(answer.failureHour.min, lang),
              max: formatNumber(answer.failureHour.max, lang),
              median: formatNumber(answer.failureHour.median, lang, 1),
            },
            lang,
          )}
        </p>
      ) : null}
      {answer ? <p className={styles.hint}>{t('fix.uncNote', lang)}</p> : null}
    </div>
  );
}

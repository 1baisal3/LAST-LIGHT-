import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t, tf } from '../../../shared/i18n';
import { addHours, formatDate } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { hourSelected } from '../../timeline/viewSlice';
import { fixApplied, fixSearchRequested } from '../fixSlice';
import { CompareCard } from './CompareCard';
import styles from './FixPanel.module.css';

export function FixPanel() {
  const dispatch = useAppDispatch();
  const lang = getLang();
  const fix = useAppSelector((state) => state.fix);
  const result = useAppSelector((state) => state.result.result);
  const resultStatus = useAppSelector((state) => state.result.status);
  const plan = useAppSelector((state) => state.plan.plan);
  const windowStart = useAppSelector((state) => state.dataset.dataset?.sites.window.start ?? null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (fix.status === 'applied') statusRef.current?.focus();
  }, [fix.status]);

  const title = t('fix.title', lang);
  const ready = result !== null && windowStart !== null && resultStatus !== 'running';
  const searching = fix.status === 'searching';

  const apply = () => {
    if (fix.status !== 'found' || !fix.preview) return;
    const { startIndex } = fix.preview;
    dispatch(planPatched({ startIndex }));
    dispatch(hourSelected(0));
    dispatch(fixApplied({ startIndex }));
  };

  let message: string | null = null;
  if (!ready && fix.status === 'idle') message = t('fix.needResult', lang);
  if (searching) message = t('fix.searching', lang);
  if (fix.status === 'same') message = t('fix.same', lang);
  if (fix.status === 'none') message = t('fix.none', lang);
  if (fix.status === 'error') message = t('fix.error', lang);
  if (fix.status === 'applied' && fix.appliedStart !== null && windowStart) {
    message = tf('fix.applied', { date: formatDate(addHours(windowStart, fix.appliedStart), lang) }, lang);
  }

  return (
    <section className={styles.panel} aria-label={title} aria-busy={searching}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.hint}>{t('fix.dateHint', lang)}</p>
      <button
        type="button"
        className={styles.search}
        disabled={!ready || searching}
        onClick={() => dispatch(fixSearchRequested())}
      >
        {t('fix.find', lang)}
      </button>
      <p
        ref={statusRef}
        className={fix.status === 'none' || fix.status === 'error' ? `${styles.status} ${styles.bad}` : styles.status}
        role="status"
        tabIndex={-1}
      >
        {message}
      </p>
      {fix.status === 'found' && fix.preview && result && windowStart ? (
        <div className={styles.found}>
          <CompareCard
            before={{ startIndex: plan.startIndex, result }}
            after={fix.preview}
            windowStart={windowStart}
            lang={lang}
          />
          <button type="button" className={styles.apply} onClick={apply}>
            {t('fix.apply', lang)}
          </button>
        </div>
      ) : null}
    </section>
  );
}

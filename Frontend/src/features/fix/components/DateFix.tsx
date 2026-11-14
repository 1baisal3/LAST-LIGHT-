import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { t, tf, type Lang } from '../../../shared/i18n';
import { addHours, formatDate } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { hourSelected } from '../../timeline/viewSlice';
import { fixApplied, fixSearchRequested } from '../fixSlice';
import { CompareCard } from './CompareCard';
import styles from './FixPanel.module.css';

interface Props {
  lang: Lang;
  ready: boolean;
}

export function DateFix({ lang, ready }: Props) {
  const dispatch = useAppDispatch();
  const fix = useAppSelector((state) => state.fix);
  const result = useAppSelector((state) => state.result.result);
  const plan = useAppSelector((state) => state.plan.plan);
  const windowStart = useAppSelector((state) => state.dataset.dataset?.sites.window.start ?? null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (fix.status === 'applied') statusRef.current?.focus();
  }, [fix.status]);

  const searching = fix.status === 'searching';
  const dateOf = (startIndex: number) => (windowStart ? formatDate(addHours(windowStart, startIndex), lang) : '');

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
  if (fix.status === 'applied' && fix.appliedStart !== null) {
    message = tf('fix.applied', { date: dateOf(fix.appliedStart) }, lang);
  }

  return (
    <div className={styles.body} aria-busy={searching}>
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
      {fix.status === 'found' && fix.preview && result ? (
        <div className={styles.found}>
          <CompareCard
            head={{
              label: t('fix.rowDate', lang),
              before: dateOf(plan.startIndex),
              after: dateOf(fix.preview.startIndex),
            }}
            before={result}
            after={fix.preview.result}
            caption={t('fix.compareCaption', lang)}
            lang={lang}
          />
          <button type="button" className={styles.apply} onClick={apply}>
            {t('fix.apply', lang)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

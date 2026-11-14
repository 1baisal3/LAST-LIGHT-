import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { MAX_CAPACITY_WH } from '../../../sim/capacity';
import { t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { capacityApplied, capacitySearchRequested } from '../capacitySlice';
import { CompareCard } from './CompareCard';
import styles from './FixPanel.module.css';

interface Props {
  lang: Lang;
  ready: boolean;
}

export function BatteryFix({ lang, ready }: Props) {
  const dispatch = useAppDispatch();
  const capacity = useAppSelector((state) => state.capacity);
  const result = useAppSelector((state) => state.result.result);
  const plan = useAppSelector((state) => state.plan.plan);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (capacity.status === 'applied') statusRef.current?.focus();
  }, [capacity.status]);

  const wh = (value: number) => tf('fix.wh', { value: formatNumber(value, lang) }, lang);
  const searching = capacity.status === 'searching';
  const answer = capacity.status === 'answered' ? capacity.answer : null;
  const found = answer && answer.capacityWh !== null ? answer : null;
  const changes = found !== null && found.capacityWh !== plan.capacityWh;

  const apply = () => {
    if (!found) return;
    dispatch(planPatched({ capacityWh: found.capacityWh }));
    dispatch(capacityApplied({ capacityWh: found.capacityWh }));
  };

  let message: string | null = null;
  let bad = false;
  if (!ready && capacity.status === 'idle') message = t('fix.needResult', lang);
  if (searching) message = t('fix.capacitySearching', lang);
  if (capacity.status === 'error') {
    message = t('fix.error', lang);
    bad = true;
  }
  if (answer && answer.capacityWh === null) {
    bad = true;
    message =
      answer.reason === 'earth'
        ? t('fix.capacityEarth', lang)
        : tf('fix.capacityAboveLimit', { max: wh(MAX_CAPACITY_WH) }, lang);
  }
  if (found) {
    const params = { need: wh(found.capacityWh), now: wh(plan.capacityWh) };
    if (found.capacityWh > plan.capacityWh) message = tf('fix.capacityMore', params, lang);
    else if (found.capacityWh < plan.capacityWh) message = tf('fix.capacityLess', params, lang);
    else message = t('fix.capacityExact', lang);
  }
  if (capacity.status === 'applied' && capacity.appliedCapacity !== null) {
    message = tf('fix.capacityApplied', { value: wh(capacity.appliedCapacity) }, lang);
  }

  return (
    <div className={styles.body} aria-busy={searching}>
      <p className={styles.hint}>{t('fix.capacityHint', lang)}</p>
      <button
        type="button"
        className={styles.search}
        disabled={!ready || searching}
        onClick={() => dispatch(capacitySearchRequested())}
      >
        {t('fix.capacityFind', lang)}
      </button>
      <p
        ref={statusRef}
        className={bad ? `${styles.status} ${styles.bad}` : styles.status}
        role="status"
        tabIndex={-1}
      >
        {message}
      </p>
      {found && changes && result ? (
        <div className={styles.found}>
          <CompareCard
            head={{ label: t('fix.rowCapacity', lang), before: wh(plan.capacityWh), after: wh(found.capacityWh) }}
            before={result}
            after={found.result}
            caption={t('fix.capacityCaption', lang)}
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

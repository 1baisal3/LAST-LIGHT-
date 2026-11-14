import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { heaterApplied, heaterSearchRequested } from '../heaterSlice';
import { CompareCard } from './CompareCard';
import styles from './FixPanel.module.css';

interface Props {
  lang: Lang;
  ready: boolean;
}

const REASON_KEYS = {
  noShadow: 'fix.heaterNoShadow',
  earth: 'fix.heaterEarth',
  battery: 'fix.heaterBattery',
} as const;

export function HeaterFix({ lang, ready }: Props) {
  const dispatch = useAppDispatch();
  const heater = useAppSelector((state) => state.heater);
  const result = useAppSelector((state) => state.result.result);
  const plan = useAppSelector((state) => state.plan.plan);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (heater.status === 'applied') statusRef.current?.focus();
  }, [heater.status]);

  const w = (value: number) => tf('fix.w', { value: formatNumber(value, lang) }, lang);
  const searching = heater.status === 'searching';
  const answer = heater.status === 'answered' ? heater.answer : null;
  const found = answer && answer.heaterW !== null ? answer : null;
  const mustReduce = found !== null && found.heaterW < plan.heaterW;

  const apply = () => {
    if (!found) return;
    dispatch(planPatched({ heaterW: found.heaterW }));
    dispatch(heaterApplied({ heaterW: found.heaterW }));
  };

  let message: string | null = null;
  let bad = false;
  if (!ready && heater.status === 'idle') message = t('fix.needResult', lang);
  if (searching) message = t('fix.heaterSearching', lang);
  if (heater.status === 'error') {
    message = t('fix.error', lang);
    bad = true;
  }
  if (answer && answer.heaterW === null) {
    message = t(REASON_KEYS[answer.reason], lang);
    bad = answer.reason !== 'noShadow';
  }
  if (found) {
    const params = { max: w(found.heaterW), now: w(plan.heaterW) };
    if (mustReduce) {
      message = tf('fix.heaterReduce', params, lang);
      bad = true;
    } else if (found.atLimit) {
      message = tf('fix.heaterAtLimit', { max: w(found.heaterW) }, lang);
    } else {
      message = tf('fix.heaterRoom', params, lang);
    }
  }
  if (heater.status === 'applied' && heater.appliedHeater !== null) {
    message = tf('fix.heaterApplied', { value: w(heater.appliedHeater) }, lang);
  }

  return (
    <div className={styles.body} aria-busy={searching}>
      <p className={styles.hint}>{t('fix.heaterHint', lang)}</p>
      <button
        type="button"
        className={styles.search}
        disabled={!ready || searching}
        onClick={() => dispatch(heaterSearchRequested())}
      >
        {t('fix.heaterFind', lang)}
      </button>
      <p
        ref={statusRef}
        className={bad ? `${styles.status} ${styles.bad}` : styles.status}
        role="status"
        tabIndex={-1}
      >
        {message}
      </p>
      {found && mustReduce && result ? (
        <div className={styles.found}>
          <CompareCard
            head={{ label: t('fix.rowHeater', lang), before: w(plan.heaterW), after: w(found.heaterW) }}
            before={result}
            after={found.result}
            caption={t('fix.heaterCaption', lang)}
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

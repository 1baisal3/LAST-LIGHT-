import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { t, tf, type Lang } from '../../../shared/i18n';
import { formatHours, formatNumber, formatPct } from '../../../shared/lib/format';
import type { Plan } from '../../../sim/types';
import { planPatched } from '../../plan/planSlice';
import { mastApplied, mastSearchRequested } from '../mastSlice';
import { outcomeText } from './CompareCard';
import styles from './FixPanel.module.css';

interface Props {
  lang: Lang;
  ready: boolean;
}

export function MastFix({ lang, ready }: Props) {
  const dispatch = useAppDispatch();
  const mast = useAppSelector((state) => state.mast);
  const plan = useAppSelector((state) => state.plan.plan);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (mast.status === 'applied') statusRef.current?.focus();
  }, [mast.status]);

  const m = (value: number) => tf('fix.m', { value: formatNumber(value, lang) }, lang);
  const searching = mast.status === 'searching';
  const options = mast.status === 'answered' ? mast.options : null;

  const choose = (mastM: Plan['mastM']) => {
    dispatch(planPatched({ mastM }));
    dispatch(mastApplied({ mastM }));
  };

  let message: string | null = null;
  let bad = false;
  if (!ready && mast.status === 'idle') message = t('fix.needResult', lang);
  if (searching) message = t('fix.mastSearching', lang);
  if (mast.status === 'error') {
    message = t('fix.error', lang);
    bad = true;
  }
  if (options && !options.some((option) => option.result.ok)) {
    message = t('fix.mastNoneOk', lang);
    bad = true;
  }
  if (mast.status === 'applied' && mast.appliedMast !== null) {
    message = tf('fix.mastApplied', { value: m(mast.appliedMast) }, lang);
  }

  return (
    <div className={styles.body} aria-busy={searching}>
      <p className={styles.hint}>{t('fix.mastHint', lang)}</p>
      <button
        type="button"
        className={styles.search}
        disabled={!ready || searching}
        onClick={() => dispatch(mastSearchRequested())}
      >
        {t('fix.mastFind', lang)}
      </button>
      <p
        ref={statusRef}
        className={bad ? `${styles.status} ${styles.bad}` : styles.status}
        role="status"
        tabIndex={-1}
      >
        {message}
      </p>
      {options ? (
        <div className={styles.found}>
          <table className={styles.compare}>
            <caption className={styles.caption}>{t('fix.mastCaption', lang)}</caption>
            <thead>
              <tr>
                <th scope="col">{t('fix.mastCol', lang)}</th>
                <th scope="col">{t('fix.rowOutcome', lang)}</th>
                <th scope="col">{t('kpi.minBattery', lang)}</th>
                <th scope="col">{t('kpi.longestDark', lang)}</th>
                <th scope="col">{t('kpi.longestBlackout', lang)}</th>
                <td />
              </tr>
            </thead>
            <tbody>
              {options.map(({ mastM, result }) => {
                const current = mastM === plan.mastM;
                return (
                  <tr key={mastM}>
                    <th scope="row">
                      {m(mastM)}
                      {current ? ` (${t('fix.mastCurrent', lang)})` : ''}
                    </th>
                    <td className={result.ok ? styles.after : undefined}>{outcomeText(result, lang)}</td>
                    <td>{formatPct(result.kpis.minBatteryPct, lang, 0)}</td>
                    <td>{formatHours(result.kpis.longestDarkH, lang)}</td>
                    <td>{formatHours(result.kpis.longestBlackoutH, lang)}</td>
                    <td>
                      {current ? null : (
                        <button type="button" className={styles.search} onClick={() => choose(mastM)}>
                          {tf('fix.mastChoose', { value: m(mastM) }, lang)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

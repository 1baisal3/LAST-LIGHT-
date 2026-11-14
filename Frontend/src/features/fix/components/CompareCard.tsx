import { t, tf, type Lang } from '../../../shared/i18n';
import { addHours, formatDate, formatHours, formatPct } from '../../../shared/lib/format';
import type { Result } from '../../../sim/types';
import styles from './FixPanel.module.css';

export interface CompareSide {
  startIndex: number;
  result: Result;
}

interface Props {
  before: CompareSide;
  after: CompareSide;
  windowStart: string;
  lang: Lang;
}

export function outcomeText(result: Result, lang: Lang): string {
  if (!result.failure) return t('fix.outcomeOk', lang);
  const reason = t(result.failure.reason === 'earth' ? 'verdict.reasonEarth' : 'verdict.reasonBattery', lang);
  return tf('fix.outcomeFail', { hour: result.failure.hour, reason }, lang);
}

export function CompareCard({ before, after, windowStart, lang }: Props) {
  const date = (side: CompareSide) => formatDate(addHours(windowStart, side.startIndex), lang);
  const rows: Array<[string, (side: CompareSide) => string]> = [
    [t('fix.rowDate', lang), date],
    [t('fix.rowOutcome', lang), (side) => outcomeText(side.result, lang)],
    [t('kpi.minBattery', lang), (side) => formatPct(side.result.kpis.minBatteryPct, lang, 0)],
    [t('kpi.longestDark', lang), (side) => formatHours(side.result.kpis.longestDarkH, lang)],
    [t('kpi.longestBlackout', lang), (side) => formatHours(side.result.kpis.longestBlackoutH, lang)],
    [t('kpi.sunlit', lang), (side) => formatPct(side.result.kpis.sunlitPct, lang, 1)],
  ];

  return (
    <table className={styles.compare}>
      <caption className={styles.caption}>{t('fix.compareCaption', lang)}</caption>
      <thead>
        <tr>
          <td />
          <th scope="col">{t('fix.before', lang)}</th>
          <th scope="col">{t('fix.after', lang)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value(before)}</td>
            <td className={styles.after}>{value(after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

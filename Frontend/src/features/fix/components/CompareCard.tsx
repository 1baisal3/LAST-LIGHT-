import { t, tf, type Lang } from '../../../shared/i18n';
import { formatHours, formatPct } from '../../../shared/lib/format';
import type { Result } from '../../../sim/types';
import styles from './FixPanel.module.css';

export interface CompareHead {
  label: string;
  before: string;
  after: string;
}

interface Props {
  head: CompareHead;
  before: Result;
  after: Result;
  caption: string;
  lang: Lang;
}

export function outcomeText(result: Result, lang: Lang): string {
  if (!result.failure) return t('fix.outcomeOk', lang);
  const reason = t(result.failure.reason === 'earth' ? 'verdict.reasonEarth' : 'verdict.reasonBattery', lang);
  return tf('fix.outcomeFail', { hour: result.failure.hour, reason }, lang);
}

export function CompareCard({ head, before, after, caption, lang }: Props) {
  const rows: Array<[string, (result: Result) => string]> = [
    [t('fix.rowOutcome', lang), (result) => outcomeText(result, lang)],
    [t('kpi.minBattery', lang), (result) => formatPct(result.kpis.minBatteryPct, lang, 0)],
    [t('kpi.longestDark', lang), (result) => formatHours(result.kpis.longestDarkH, lang)],
    [t('kpi.longestBlackout', lang), (result) => formatHours(result.kpis.longestBlackoutH, lang)],
    [t('kpi.sunlit', lang), (result) => formatPct(result.kpis.sunlitPct, lang, 1)],
  ];

  return (
    <table className={styles.compare}>
      <caption className={styles.caption}>{caption}</caption>
      <thead>
        <tr>
          <td />
          <th scope="col">{t('fix.before', lang)}</th>
          <th scope="col">{t('fix.after', lang)}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{head.label}</th>
          <td>{head.before}</td>
          <td className={styles.after}>{head.after}</td>
        </tr>
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

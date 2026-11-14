import { useSelector } from 'react-redux';
import type { RootState } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { formatHours, formatPct } from '../../../shared/lib/format';
import type { Result } from '../../../sim/types';
import { KpiTile } from './KpiTile';
import styles from './KpiRow.module.css';

interface ViewProps {
  result: Result | null;
  stale: boolean;
}

export function KpiRowView({ result, stale }: ViewProps) {
  const lang = getLang();
  const kpis = result?.kpis ?? null;
  const reason = result?.failure?.reason ?? null;

  return (
    <dl
      className={`${styles.root} ${stale ? styles.stale : ''}`}
      aria-label={t('kpi.title')}
      aria-busy={stale}
    >
      <KpiTile
        label={t('kpi.minBattery')}
        value={kpis ? formatPct(kpis.minBatteryPct, lang, 0) : null}
        failed={reason === 'battery'}
      />
      <KpiTile
        label={t('kpi.longestDark')}
        value={kpis ? formatHours(kpis.longestDarkH, lang) : null}
      />
      <KpiTile
        label={t('kpi.longestBlackout')}
        value={kpis ? formatHours(kpis.longestBlackoutH, lang) : null}
        failed={reason === 'earth'}
      />
      <KpiTile
        label={t('kpi.sunlit')}
        value={kpis ? formatPct(kpis.sunlitPct, lang, 1) : null}
      />
    </dl>
  );
}

export function KpiRow() {
  const { status, result } = useSelector((state: RootState) => state.result);
  return <KpiRowView result={status === 'error' ? null : result} stale={status === 'running'} />;
}

import { t } from '../../../shared/i18n';
import styles from './KpiTile.module.css';

interface Props {
  label: string;
  value: string | null;
  failed?: boolean;
}

export function KpiTile({ label, value, failed = false }: Props) {
  return (
    <div className={`${styles.root} ${failed ? styles.failed : ''}`}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>
        <span className={styles.number}>{value ?? '—'}</span>
        {failed ? <span className={styles.flag}>{t('kpi.flagFail')}</span> : null}
      </dd>
    </div>
  );
}

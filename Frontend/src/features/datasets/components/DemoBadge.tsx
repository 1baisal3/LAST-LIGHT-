import { t } from '../../../shared/i18n';
import type { Provenance } from '../types';
import styles from './DemoBadge.module.css';

interface Props {
  provenance: Pick<Provenance, 'mode'> | null;
}

export function DemoBadge({ provenance }: Props) {
  if (provenance?.mode === 'final') return null;
  return (
    <span className={styles.badge} role="status">
      {t('demo.badge')}
    </span>
  );
}

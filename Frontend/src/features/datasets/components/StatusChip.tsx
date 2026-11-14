import { t } from '../../../shared/i18n';
import type { ValidationCheck } from '../types';
import styles from './StatusChip.module.css';

interface Props {
  status: ValidationCheck['status'];
}

export function StatusChip({ status }: Props) {
  return <span className={`${styles.chip} ${styles[status]}`}>{t(`sources.${status}`)}</span>;
}

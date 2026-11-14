import { t, tf } from '../../../shared/i18n';
import styles from './DurationNote.module.css';

export function DurationNote({ durationH }: { durationH: number }) {
  return (
    <p className={styles.note}>
      <span>{t('plan.durationLabel')}</span>
      <strong>{tf('plan.duration', { days: durationH / 24, hours: durationH })}</strong>
    </p>
  );
}

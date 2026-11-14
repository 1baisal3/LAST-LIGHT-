import { t } from '../../../shared/i18n';
import styles from './DataState.module.css';

interface Props {
  status: 'loading' | 'error';
  message?: string | null;
  onRetry?: () => void;
}

export function DataState({ status, message, onRetry }: Props) {
  if (status === 'loading') {
    return (
      <section className={styles.state} role="status" aria-busy="true" aria-live="polite">
        <h2 className={styles.title}>{t('data.loading')}</h2>
        <div className={styles.skeletons} aria-hidden="true">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.state} ${styles.error}`} role="alert">
      <h2 className={styles.title}>{t('data.error')}</h2>
      {message ? <p className={styles.detail}>{message}</p> : null}
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('data.retry')}
      </button>
    </section>
  );
}

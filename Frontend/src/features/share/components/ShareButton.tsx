import { useState } from 'react';
import { useAppSelector } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { encodePlanHash } from '../planLink';
import styles from './Share.module.css';

type Status = 'idle' | 'copied' | 'inAddress';

export function ShareButton() {
  const lang = getLang();
  const plan = useAppSelector((state) => state.plan.plan);
  const sites = useAppSelector((state) => state.dataset.dataset?.sites ?? null);
  const [status, setStatus] = useState<Status>('idle');

  const share = async () => {
    if (!sites) return;
    const hash = encodePlanHash(plan, sites);
    if (!hash) return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(window.history.state, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('inAddress');
    }
  };

  return (
    <span className={styles.share}>
      <button type="button" className={styles.button} disabled={!sites} onClick={share}>
        {t('share.copy', lang)}
      </button>
      <span className={styles.status} role="status">
        {status === 'copied' ? t('share.copied', lang) : status === 'inAddress' ? t('share.inAddress', lang) : ''}
      </span>
    </span>
  );
}

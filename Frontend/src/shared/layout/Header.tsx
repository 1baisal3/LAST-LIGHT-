import type { ReactNode } from 'react';
import { t } from '../i18n';
import styles from './Header.module.css';
import { LangSwitch } from './LangSwitch';

interface Props {
  status?: ReactNode;
}

export function Header({ status = null }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <strong className={styles.logo}>{t('app.title')}</strong>
        <span className={styles.challenge}>{t('shell.challenge')}</span>
        <span className={styles.subtitle}>{t('shell.subtitle')}</span>
      </div>
      <div className={styles.meta}>
        {status}
        <LangSwitch />
      </div>
    </header>
  );
}

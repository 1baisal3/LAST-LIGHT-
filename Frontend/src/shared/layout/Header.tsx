import { t } from '../i18n';

export function Header() {
  return (
    <header style={{ padding: 'var(--space-3)' }}>
      <strong>{t('app.title')}</strong>
    </header>
  );
}

import { setLang, t, useLang, type Lang } from '../i18n';
import styles from './LangSwitch.module.css';

type OptionKey = 'shell.langRu' | 'shell.langEn';
type NameKey = 'shell.langRuLabel' | 'shell.langEnLabel';

const OPTIONS: { lang: Lang; label: OptionKey; name: NameKey }[] = [
  { lang: 'ru', label: 'shell.langRu', name: 'shell.langRuLabel' },
  { lang: 'en', label: 'shell.langEn', name: 'shell.langEnLabel' },
];

export function LangSwitch() {
  const current = useLang();
  return (
    <div className={styles.group} role="group" aria-label={t('shell.lang')}>
      {OPTIONS.map(({ lang, label, name }) => (
        <button
          key={lang}
          type="button"
          className={styles.button}
          aria-pressed={current === lang}
          aria-label={t(name)}
          onClick={() => setLang(lang)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

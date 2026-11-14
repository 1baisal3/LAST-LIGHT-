import { useState, type KeyboardEvent } from 'react';
import { useAppSelector } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { BatteryFix } from './BatteryFix';
import { DateFix } from './DateFix';
import styles from './FixPanel.module.css';

type TabId = 'date' | 'battery';

export function FixPanel() {
  const lang = getLang();
  const result = useAppSelector((state) => state.result.result);
  const resultStatus = useAppSelector((state) => state.result.status);
  const windowStart = useAppSelector((state) => state.dataset.dataset?.sites.window.start ?? null);
  const capabilities = useAppSelector((state) => state.dataset.dataset?.provenance.capabilities ?? null);
  const [chosen, setChosen] = useState<TabId>('date');

  const tabs: TabId[] = capabilities?.minCapacity ? ['date', 'battery'] : ['date'];
  const active: TabId = tabs.includes(chosen) ? chosen : 'date';
  const ready = result !== null && windowStart !== null && resultStatus !== 'running';
  const title = t('fix.title', lang);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(tabs.indexOf(active) + step + tabs.length) % tabs.length]!;
    setChosen(next);
    document.getElementById(`fix-tab-${next}`)?.focus();
  };

  const body =
    active === 'battery' ? <BatteryFix lang={lang} ready={ready} /> : <DateFix lang={lang} ready={ready} />;

  return (
    <section className={styles.panel} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {tabs.length > 1 ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label={title} onKeyDown={onKeyDown}>
            {tabs.map((tab) => (
              <button
                key={tab}
                id={`fix-tab-${tab}`}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={tab === active}
                aria-controls={`fix-panel-${tab}`}
                tabIndex={tab === active ? 0 : -1}
                onClick={() => setChosen(tab)}
              >
                {t(`fix.tab.${tab}`, lang)}
              </button>
            ))}
          </div>
          <div id={`fix-panel-${active}`} role="tabpanel" aria-labelledby={`fix-tab-${active}`}>
            {body}
          </div>
        </>
      ) : (
        body
      )}
    </section>
  );
}

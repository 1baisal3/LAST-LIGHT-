import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { t, tf } from '../../../shared/i18n';
import type { Provenance, Validation } from '../types';
import { StatusChip } from './StatusChip';
import styles from './SourcesDrawer.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  provenance: Provenance | null;
  validation: Validation | null;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SourcesDrawer({ open, onClose, provenance, validation, returnFocusTo }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = returnFocusTo?.current ?? (document.activeElement as HTMLElement | null);
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [open, returnFocusTo]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const sources = provenance?.sources ?? [];
  const checks = validation?.checks ?? [];
  const notes = provenance?.notes ?? '';

  return (
    <div className={styles.overlay} onKeyDown={onKeyDown}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-title"
      >
        <div className={styles.head}>
          <h2 id="sources-title" className={styles.title}>
            {t('sources.title')}
          </h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
            {t('sources.close')}
          </button>
        </div>

        <h3 className={styles.heading}>{t('sources.sourcesHeading')}</h3>
        {sources.length === 0 ? (
          <p className={styles.muted}>{t('sources.noSources')}</p>
        ) : (
          <ul className={styles.list}>
            {sources.map((source, index) => (
              <li key={`${source.title}-${index}`}>
                <strong>{source.title}</strong>
                <p className={styles.muted}>{source.text ?? t('sources.noText')}</p>
              </li>
            ))}
          </ul>
        )}

        {notes ? (
          <>
            <h3 className={styles.heading}>{t('sources.notesHeading')}</h3>
            <p>{notes}</p>
          </>
        ) : null}

        <h3 className={styles.heading}>{t('sources.checksHeading')}</h3>
        <ul className={styles.list}>
          {checks.map((check) => (
            <li key={check.level} className={styles.check}>
              <span>
                {tf('sources.level', { level: check.level })}: {check.name}
              </span>
              <StatusChip status={check.status} />
            </li>
          ))}
        </ul>

        <p className={styles.muted}>{t('shell.disclaimer')}</p>
      </div>
    </div>
  );
}

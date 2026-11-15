import { useRef, useState } from 'react';
import { t, tf } from '../../../shared/i18n';
import type { Dataset } from '../types';
import styles from './DataStatusBar.module.css';
import { DemoBadge } from './DemoBadge';
import { SourcesDrawer } from './SourcesDrawer';
import { ValidationReport } from './ValidationReport';

interface Props {
  dataset: Dataset;
}

export function passedChecks(dataset: Dataset): number {
  return dataset.validation.checks.filter((check) => check.status === 'passed').length;
}

export function DataStatusBar({ dataset }: Props) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const total = dataset.validation.checks.length;

  return (
    <div className={styles.status}>
      <DemoBadge provenance={dataset.provenance} />
      <span className={styles.passed}>
        {tf('shell.checksPassed', { count: passedChecks(dataset), total })}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.sources}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t('shell.sources')}
      </button>
      <SourcesDrawer
        open={open}
        onClose={() => setOpen(false)}
        provenance={dataset.provenance}
        validation={dataset.validation}
        returnFocusTo={triggerRef}
        onOpenReport={() => {
          setOpen(false);
          setReportOpen(true);
        }}
      />
      {reportOpen ? (
        <ValidationReport
          dataset={dataset}
          onClose={() => {
            setReportOpen(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

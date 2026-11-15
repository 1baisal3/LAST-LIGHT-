import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { getLang, t, tf } from '../../../shared/i18n';
import { formatUtc } from '../../../shared/lib/format';
import type { Dataset, ValidationCheck } from '../types';
import { StatusChip } from './StatusChip';
import styles from './ValidationReport.module.css';

type Filter = 'all' | ValidationCheck['status'];

const FILTERS: Filter[] = ['all', 'pending', 'passed', 'failed'];
const CAPABILITIES = [
  ['minCapacity', 'report.capMinCapacity'],
  ['heater', 'report.capHeater'],
  ['uncertainty', 'report.capUncertainty'],
] as const;

interface Props {
  dataset: Dataset;
  onClose: () => void;
}

function measure(check: ValidationCheck): string {
  const parts = [check.measurement, check.tolerance].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' / ') : '—';
}

export function ValidationReport({ dataset, onClose }: Props) {
  const lang = getLang();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { provenance, validation } = dataset;
  const checks = validation.checks.filter((check) => filter === 'all' || check.status === filter);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t('report.title', lang)}
          </h2>
          <button ref={closeRef} type="button" className={styles.button} onClick={onClose}>
            {t('report.close', lang)}
          </button>
        </header>

        <dl className={styles.facts}>
          <div>
            <dt>{t('report.dataset', lang)}</dt>
            <dd>{dataset.datasetId}</dd>
          </div>
          <div>
            <dt>{t('report.mode', lang)}</dt>
            <dd>{t(provenance.mode === 'final' ? 'report.modeFinal' : 'report.modeDemo', lang)}</dd>
          </div>
          <div>
            <dt>{t('report.capabilities', lang)}</dt>
            <dd>
              {CAPABILITIES.map(([key, label]) => (
                <span key={key} className={styles.cap}>
                  {t(label, lang)}: {t(provenance.capabilities[key] ? 'report.yes' : 'report.no', lang)}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <h3 className={styles.heading}>{t('sources.sourcesHeading', lang)}</h3>
        {provenance.sources.length === 0 ? (
          <p className={styles.muted}>{t('sources.noSources', lang)}</p>
        ) : (
          <ul className={styles.sources}>
            {provenance.sources.map((source, index) => (
              <li key={`${source.title}-${index}`}>
                <strong>{source.title}</strong>
                <p className={styles.muted}>{source.text ?? t('sources.noText', lang)}</p>
              </li>
            ))}
          </ul>
        )}
        {provenance.notes ? (
          <>
            <h3 className={styles.heading}>{t('sources.notesHeading', lang)}</h3>
            <p className={styles.notes}>{provenance.notes}</p>
          </>
        ) : null}

        <h3 className={styles.heading}>{t('report.checks', lang)}</h3>
        <div className={styles.filters} role="group" aria-label={t('report.filter', lang)}>
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={styles.button}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? t('report.all', lang) : t(`sources.${item}`, lang)}
            </button>
          ))}
        </div>
        {checks.length === 0 ? (
          <p className={styles.muted} role="status">
            {t('report.empty', lang)}
          </p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('report.colLevel', lang)}</th>
                  <th scope="col">{t('report.colName', lang)}</th>
                  <th scope="col">{t('report.colStatus', lang)}</th>
                  <th scope="col">{t('report.colMeasure', lang)}</th>
                  <th scope="col">{t('report.colDate', lang)}</th>
                  <th scope="col">{t('report.colDataset', lang)}</th>
                  <th scope="col">{t('report.colReport', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check, index) => (
                  <tr key={`${check.level}-${check.name}-${index}`}>
                    <td>{tf('sources.level', { level: check.level }, lang)}</td>
                    <th scope="row">{check.name}</th>
                    <td>
                      <StatusChip status={check.status} />
                    </td>
                    <td>{measure(check)}</td>
                    <td>{check.ranAt ? formatUtc(check.ranAt, lang) : t('report.notRun', lang)}</td>
                    <td>{validation.datasetId}</td>
                    <td>
                      {check.report && /^https?:\/\//.test(check.report) ? (
                        <a href={check.report} target="_blank" rel="noreferrer">
                          {check.report}
                        </a>
                      ) : (
                        (check.report ?? '—')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.muted}>{t('shell.disclaimer', lang)}</p>
      </div>
    </div>
  );
}

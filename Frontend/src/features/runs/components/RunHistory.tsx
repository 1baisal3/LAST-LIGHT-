import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t, tf, type Lang } from '../../../shared/i18n';
import { formatPct, formatUtc } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { hourSelected } from '../../timeline/viewSlice';
import type { RunEntry } from '../runModel';
import { useDeleteRunMutation, useListRunsQuery } from '../runsApi';
import styles from './RunHistory.module.css';

function verdictText(entry: RunEntry, lang: Lang): string {
  const result = entry.frozen?.result;
  if (!result) return t('runs.foreign', lang);
  if (!result.failure) return t('runs.ok', lang);
  const reason = t(result.failure.reason === 'earth' ? 'verdict.reasonEarth' : 'verdict.reasonBattery', lang);
  return tf('runs.fail', { hour: result.failure.hour, reason }, lang);
}

function RunList() {
  const lang = getLang();
  const dispatch = useAppDispatch();
  const datasetId = useAppSelector((state) => state.dataset.dataset?.datasetId ?? null);
  const { data, isLoading, isError, refetch } = useListRunsQuery();
  const [remove, removeState] = useDeleteRunMutation();

  if (isLoading) return <p className={styles.muted}>{t('runs.loading', lang)}</p>;
  if (isError) {
    return (
      <p className={styles.bad} role="alert">
        {t('runs.error', lang)}{' '}
        <button type="button" className={styles.action} onClick={() => refetch()}>
          {t('data.retry', lang)}
        </button>
      </p>
    );
  }
  if (!data || data.length === 0) return <p className={styles.muted}>{t('runs.empty', lang)}</p>;

  return (
    <ul className={styles.list}>
      {data.map((entry) => {
        const frozen = entry.frozen;
        return (
          <li key={entry.id} className={styles.item}>
            <div className={styles.head}>
              <strong>{entry.name || t('runs.untitled', lang)}</strong>
              <span className={styles.muted}>{formatUtc(entry.createdAt, lang)}</span>
            </div>
            <p className={frozen?.result.ok ? styles.ok : styles.bad}>
              {verdictText(entry, lang)}
              {frozen ? ` · ${t('kpi.minBattery', lang)} ${formatPct(frozen.result.kpis.minBatteryPct, lang, 0)}` : ''}
            </p>
            {frozen && datasetId !== null && frozen.datasetId !== datasetId ? (
              <p className={styles.muted}>{t('runs.otherDataset', lang)}</p>
            ) : null}
            <div className={styles.actions}>
              {frozen ? (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => {
                    dispatch(planPatched(frozen.plan));
                    dispatch(hourSelected(0));
                  }}
                >
                  {t('runs.load', lang)}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.action}
                disabled={removeState.isLoading}
                aria-label={tf('runs.deleteNamed', { name: entry.name || t('runs.untitled', lang) }, lang)}
                onClick={() => remove(entry.id)}
              >
                {t('runs.delete', lang)}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RunHistory() {
  const lang = getLang();
  const loggedIn = useAppSelector((state) => state.session.refresh !== null);
  if (!loggedIn) return null;
  const title = t('runs.title', lang);
  return (
    <section className={styles.panel} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.muted}>{t('runs.hint', lang)}</p>
      <RunList />
    </section>
  );
}

import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t, tf, type Lang } from '../../../shared/i18n';
import { formatPct, formatUtc } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { hourSelected } from '../../timeline/viewSlice';
import type { RunEntry } from '../runModel';
import { useDeleteRunMutation, useListRunsQuery, useRenameRunMutation } from '../runsApi';
import styles from './RunHistory.module.css';

function verdictText(entry: RunEntry, lang: Lang): string {
  const result = entry.frozen?.result;
  if (!result) return t('runs.foreign', lang);
  if (!result.failure) return t('runs.ok', lang);
  const reason = t(result.failure.reason === 'earth' ? 'verdict.reasonEarth' : 'verdict.reasonBattery', lang);
  return tf('runs.fail', { hour: result.failure.hour, reason }, lang);
}

function RunItem({ entry, datasetId, lang }: { entry: RunEntry; datasetId: string | null; lang: Lang }) {
  const dispatch = useAppDispatch();
  const [remove, removeState] = useDeleteRunMutation();
  const [rename, renameState] = useRenameRunMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const frozen = entry.frozen;
  const title = entry.name || t('runs.untitled', lang);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim().slice(0, 255);
    if (name && name !== entry.name) await rename({ id: entry.id, name });
    setEditing(false);
  };

  return (
    <li className={styles.item}>
      {editing ? (
        <form className={styles.rename} onSubmit={save}>
          <input
            className={styles.input}
            value={draft}
            maxLength={255}
            aria-label={t('runs.newName', lang)}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(entry.name);
                setEditing(false);
              }
            }}
          />
          <button type="submit" className={styles.action} disabled={renameState.isLoading}>
            {t('runs.save', lang)}
          </button>
        </form>
      ) : (
        <div className={styles.head}>
          <strong>{title}</strong>
          <span className={styles.muted}>{formatUtc(entry.createdAt, lang)}</span>
        </div>
      )}
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
        {editing ? null : (
          <button
            type="button"
            className={styles.action}
            aria-label={tf('runs.renameNamed', { name: title }, lang)}
            onClick={() => {
              setDraft(entry.name);
              setEditing(true);
            }}
          >
            {t('runs.rename', lang)}
          </button>
        )}
        <button
          type="button"
          className={styles.action}
          disabled={removeState.isLoading}
          aria-label={tf('runs.deleteNamed', { name: title }, lang)}
          onClick={() => remove(entry.id)}
        >
          {t('runs.delete', lang)}
        </button>
      </div>
    </li>
  );
}

function RunList() {
  const lang = getLang();
  const datasetId = useAppSelector((state) => state.dataset.dataset?.datasetId ?? null);
  const { data, isLoading, isError, refetch } = useListRunsQuery();

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
      {data.map((entry) => (
        <RunItem key={entry.id} entry={entry} datasetId={datasetId} lang={lang} />
      ))}
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

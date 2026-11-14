import { useId, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { NumberField } from '../../../shared/ui/NumberField';
import { validStarts } from '../../../sim/search';
import type { Plan, Site } from '../../../sim/types';
import type { Dataset } from '../../datasets/types';
import { DEFAULT_BLACKOUT_H, DEVICE_FIELDS, HEATER_FIELD, type MastOption } from '../fields';
import { draftErrors, planErrorText } from '../planErrors';
import { draftCommitRequested, draftPatched, planPatched } from '../planSlice';
import { BlackoutToggle } from './BlackoutToggle';
import { DateField } from './DateField';
import { DurationNote } from './DurationNote';
import styles from './MissionPanel.module.css';
import { SiteCard } from './SiteCard';

function mastOptions(site: Site): MastOption[] {
  const options: MastOption[] = [2];
  if (site.horizonByMast?.['5']) options.push(5);
  if (site.horizonByMast?.['10']) options.push(10);
  return options;
}

function MissionForm({ dataset }: { dataset: Dataset }) {
  const lang = getLang();
  const dispatch = useDispatch();
  const plan = useSelector((state: RootState) => state.plan.plan);
  const draft = useSelector((state: RootState) => state.plan.draft);
  const formRef = useRef<HTMLFormElement>(null);
  const mastId = useId();
  const [lastBlackoutH, setLastBlackoutH] = useState(plan.maxBlackoutH ?? DEFAULT_BLACKOUT_H);

  const sites = dataset.sites.sites;
  const capabilities = dataset.provenance.capabilities;
  const site = sites.find((candidate) => candidate.id === draft.siteId) ?? sites[0];
  const errors = useMemo(
    () => draftErrors(plan, draft, dataset.sites, capabilities),
    [plan, draft, dataset.sites, capabilities],
  );
  const starts = useMemo(() => (site ? validStarts(site, plan.durationH) : []), [site, plan.durationH]);

  if (!site) return null;

  const errorOf = (field: keyof Plan): string | undefined => {
    const error = errors[field];
    return error ? planErrorText(error, lang, draft[field]) : undefined;
  };

  const patchDraft = (patch: Partial<Plan>) => {
    dispatch(draftPatched(patch));
  };

  const patchNow = (patch: Partial<Plan>) => {
    dispatch(planPatched(patch));
  };

  const confirm = (moveFocus: boolean) => {
    if (Object.keys(errors).length > 0) {
      if (moveFocus) {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }
      return;
    }
    dispatch(draftCommitRequested());
  };

  const selectSite = (siteId: string) => {
    const next = sites.find((candidate) => candidate.id === siteId);
    if (!next || siteId === plan.siteId) return;
    const nextStarts = validStarts(next, plan.durationH);
    const startIndex = nextStarts.includes(plan.startIndex)
      ? plan.startIndex
      : (nextStarts[0] ?? plan.startIndex);
    patchNow({ siteId, startIndex });
  };

  const blackoutOn = draft.maxBlackoutH !== null;
  const blackoutValue = draft.maxBlackoutH ?? lastBlackoutH;
  const masts = mastOptions(site);

  return (
    <form
      ref={formRef}
      className={styles.form}
      noValidate
      aria-label={t('plan.title')}
      onSubmit={(event) => {
        event.preventDefault();
        confirm(true);
      }}
    >
      <h2 className={styles.title}>{t('plan.title')}</h2>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('plan.sites')}</legend>
        {sites.map((candidate) => (
          <SiteCard
            key={candidate.id}
            site={candidate}
            selected={candidate.id === plan.siteId}
            onSelect={selectSite}
          />
        ))}
      </fieldset>

      <div className={styles.group}>
        <DateField
          site={site}
          starts={starts}
          value={draft.startIndex}
          error={errorOf('startIndex')}
          onChange={(startIndex) => patchNow({ startIndex })}
        />
        <DurationNote durationH={plan.durationH} />
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('plan.device')}</legend>
        {DEVICE_FIELDS.map((field) => (
          <NumberField
            key={field.key}
            label={t(field.label)}
            unit={t(field.unit)}
            value={draft[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            error={errorOf(field.key)}
            onChange={(value) => patchDraft({ [field.key]: value })}
            onCommit={confirm}
          />
        ))}
        <BlackoutToggle
          enabled={blackoutOn}
          value={blackoutValue}
          error={errorOf('maxBlackoutH')}
          onToggle={(enabled) => patchNow({ maxBlackoutH: enabled ? lastBlackoutH : null })}
          onChange={(value) => {
            if (Number.isFinite(value)) setLastBlackoutH(value);
            patchDraft({ maxBlackoutH: value });
          }}
          onCommit={confirm}
        />
        {capabilities.heater ? (
          <NumberField
            label={t(HEATER_FIELD.label)}
            unit={t(HEATER_FIELD.unit)}
            value={draft.heaterW}
            min={HEATER_FIELD.min}
            max={HEATER_FIELD.max}
            step={HEATER_FIELD.step}
            error={errorOf('heaterW')}
            onChange={(value) => patchDraft({ heaterW: value })}
            onCommit={confirm}
          />
        ) : null}
        {site.horizonByMast ? (
          <div className={styles.mast}>
            <label htmlFor={mastId}>{t('plan.mastM')}</label>
            <select
              id={mastId}
              className={styles.select}
              value={draft.mastM}
              aria-invalid={errors.mastM ? true : undefined}
              onChange={(event) => patchNow({ mastM: Number(event.target.value) as MastOption })}
            >
              {masts.map((mast) => (
                <option key={mast} value={mast}>
                  {mast} {t('plan.unitM')}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <p className={styles.note}>{t('plan.example')}</p>
    </form>
  );
}

export function MissionPanel() {
  const dataset = useSelector((state: RootState) => state.dataset.dataset);

  if (!dataset) {
    return (
      <section aria-label={t('plan.title')}>
        <h2>{t('plan.title')}</h2>
      </section>
    );
  }

  return <MissionForm dataset={dataset} />;
}

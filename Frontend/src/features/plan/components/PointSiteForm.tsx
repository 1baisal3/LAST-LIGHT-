import { useId, useState, type KeyboardEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../../app/store';
import { t } from '../../../shared/i18n';
import { parseNumber } from '../../../shared/lib/numberInput';
import { datasetActivated } from '../../datasets/datasetSlice';
import type { Dataset } from '../../datasets/types';
import { planPatched } from '../planSlice';
import { planForPoint, useLazyGetPointSiteQuery, validCoordinates, withPointSite } from '../pointSite';
import styles from './PointSiteForm.module.css';

function failureText(error: unknown): string {
  const status = (error as { status?: unknown } | undefined)?.status;
  if (status === 400) return t('plan.pointBad');
  if (status === 422) return t('plan.pointCoverage');
  if (status === 404) return t('plan.pointNoRelease');
  return t('plan.pointServer');
}

export function PointSiteForm({ dataset }: { dataset: Dataset }) {
  const dispatch = useDispatch();
  const plan = useSelector((state: RootState) => state.plan.plan);
  const latId = useId();
  const lonId = useId();
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fetchPoint, { isFetching }] = useLazyGetPointSiteQuery();

  const lat = parseNumber(latText);
  const lon = parseNumber(lonText);
  const valid = validCoordinates(lat, lon);
  const showErrors = touched && (!valid.lat || !valid.lon);

  const submit = async () => {
    setTouched(true);
    setMessage(null);
    if (!valid.lat || !valid.lon) return;
    const answer = await fetchPoint({ datasetId: dataset.datasetId, lat, lon });
    if (answer.error || !answer.data) {
      setMessage(failureText(answer.error));
      return;
    }
    try {
      const next = withPointSite(dataset, answer.data.site, t('plan.pointName'));
      dispatch(datasetActivated(next));
      dispatch(planPatched(planForPoint(plan, answer.data.site)));
      setMode(answer.data.dataMode);
    } catch {
      setMessage(t('plan.pointServer'));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    void submit();
  };

  return (
    <div className={styles.form} role="group" aria-label={t('plan.pointTitle')}>
      <p className={styles.title}>{t('plan.pointTitle')}</p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={latId}>{t('plan.pointLat')}</label>
          <span className={styles.input}>
            <input
              id={latId}
              inputMode="decimal"
              value={latText}
              placeholder="-89,45"
              aria-invalid={showErrors && !valid.lat ? true : undefined}
              onChange={(event) => setLatText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <span aria-hidden="true">°</span>
          </span>
        </div>
        <div className={styles.field}>
          <label htmlFor={lonId}>{t('plan.pointLon')}</label>
          <span className={styles.input}>
            <input
              id={lonId}
              inputMode="decimal"
              value={lonText}
              placeholder="-136,5"
              aria-invalid={showErrors && !valid.lon ? true : undefined}
              onChange={(event) => setLonText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <span aria-hidden="true">°</span>
          </span>
        </div>
      </div>
      {showErrors ? <p className={styles.error}>{t('plan.pointBad')}</p> : null}
      <button type="button" className={styles.button} disabled={isFetching} onClick={() => void submit()}>
        {isFetching ? t('plan.pointLoading') : t('plan.pointSubmit')}
      </button>
      <p className={styles.error} role="alert">
        {message}
      </p>
      {mode ? (
        <p className={styles.note} role="status">
          {t(mode === 'synthetic-v1' ? 'plan.pointSynthetic' : 'plan.pointExternal')}
        </p>
      ) : null}
      <p className={styles.hint}>{t('plan.pointHint')}</p>
    </div>
  );
}

import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber, formatUtc } from '../../../shared/lib/format';
import { positionTime } from '../../timeline/timelineModel';
import { hourSelected } from '../../timeline/viewSlice';
import { diagnose, type DiagnosisItem } from '../diagnosis';
import styles from './WhyPanel.module.css';

function describe(item: DiagnosisItem, lang: Lang, windowStart: string, startIndex: number): string {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(item.numbers)) {
    params[key] = formatNumber(value, lang, 1);
  }
  if (item.hour !== null) {
    params.time = formatUtc(positionTime(windowStart, startIndex, item.hour), lang);
  }
  return tf(`why.${item.ruleId}.${item.variant}`, params, lang);
}

export function WhyPanel() {
  const dispatch = useAppDispatch();
  const lang = getLang();
  const result = useAppSelector((state) => state.result.result);
  const status = useAppSelector((state) => state.result.status);
  const plan = useAppSelector((state) => state.plan.plan);
  const dataset = useAppSelector((state) => state.dataset.dataset);
  const selectedHour = useAppSelector((state) => state.view.selectedHour);

  const site = dataset?.sites.sites.find((item) => item.id === plan.siteId) ?? null;
  const items = useMemo(() => (result ? diagnose(result, plan, site) : []), [result, plan, site]);
  const title = t('why.title', lang);

  if (!result || !dataset) {
    return (
      <section className={styles.panel} aria-label={title} aria-busy={status === 'running'}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.empty}>
          {status === 'running' ? t('why.recalculating', lang) : t('why.empty', lang)}
        </p>
      </section>
    );
  }

  const windowStart = dataset.sites.window.start;

  return (
    <section className={styles.panel} aria-label={title} aria-busy={status === 'running'}>
      <h2 className={styles.title}>{title}</h2>
      <ol className={styles.list}>
        {items.map((item) => {
          const { hour } = item;
          const text = describe(item, lang, windowStart, plan.startIndex);
          const className = item.ruleId === 'failure' ? `${styles.item} ${styles.fail}` : styles.item;
          return (
            <li key={item.ruleId}>
              {hour === null ? (
                <p className={className}>{text}</p>
              ) : (
                <button
                  type="button"
                  className={className}
                  aria-current={hour === selectedHour ? 'true' : undefined}
                  onClick={() => dispatch(hourSelected(hour))}
                >
                  {text}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import type { CalendarCell } from '../../../sim/search';
import { getLang, t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber, formatUtcDate } from '../../../shared/lib/format';
import { planPatched } from '../../plan/planSlice';
import { positionTime } from '../../timeline/timelineModel';
import { buildRows, cellKind, type CellKind } from '../calendarModel';
import styles from './Calendar.module.css';

const ICONS: Record<CellKind, string> = {
  ok: '✓',
  failBattery: '⚡',
  failEarth: '⌁',
  unavailable: '—',
};

function cellText(cell: CalendarCell | null, kind: CellKind, lang: Lang): string {
  if (!cell || kind === 'unavailable') return t('calendar.unavailable', lang);
  if (kind === 'ok') {
    return tf('calendar.ok', { margin: formatNumber(cell.marginPct, lang, 1) }, lang);
  }
  const hour = formatNumber(cell.failure?.hour ?? 0, lang);
  return tf(kind === 'failEarth' ? 'calendar.failEarth' : 'calendar.failBattery', { hour }, lang);
}

export function Calendar() {
  const dispatch = useAppDispatch();
  const lang = getLang();
  const calendar = useAppSelector((state) => state.calendar);
  const plan = useAppSelector((state) => state.plan.plan);
  const dataset = useAppSelector((state) => state.dataset.dataset);

  const sites = dataset?.sites.sites ?? [];
  const siteIds = useMemo(() => sites.map((site) => site.id), [sites]);
  const rows = useMemo(() => buildRows(calendar.cells, siteIds), [calendar.cells, siteIds]);
  const title = t('calendar.title', lang);
  const stale = calendar.status === 'running';

  if (!dataset || rows.length === 0) {
    const message =
      calendar.status === 'error'
        ? t('calendar.error', lang)
        : stale
          ? t('calendar.running', lang)
          : t('calendar.empty', lang);
    return (
      <section className={styles.calendar} aria-label={title} aria-busy={stale}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.empty}>{message}</p>
      </section>
    );
  }

  const windowStart = dataset.sites.window.start;

  return (
    <section className={styles.calendar} aria-label={title} aria-busy={stale}>
      <h2 className={styles.title}>{title}</h2>
      {stale ? <p className={styles.note}>{t('calendar.stale', lang)}</p> : null}
      <div className={styles.scroll}>
        <table className={stale ? `${styles.table} ${styles.stale}` : styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('calendar.date', lang)}</th>
              {sites.map((site) => (
                <th key={site.id} scope="col">
                  {site.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const date = formatUtcDate(positionTime(windowStart, row.startIndex, 0), lang);
              return (
                <tr key={row.startIndex}>
                  <th scope="row">{date}</th>
                  {row.cells.map((cell, index) => {
                    const site = sites[index]!;
                    const kind = cellKind(cell);
                    const text = cellText(cell, kind, lang);
                    const selected = plan.siteId === site.id && plan.startIndex === row.startIndex;
                    return (
                      <td key={site.id}>
                        <button
                          type="button"
                          className={`${styles.cell} ${styles[kind]}`}
                          aria-pressed={selected}
                          aria-label={`${site.name}, ${date}: ${text}`}
                          disabled={kind === 'unavailable'}
                          onClick={() => dispatch(planPatched({ siteId: site.id, startIndex: row.startIndex }))}
                        >
                          <span aria-hidden="true">{ICONS[kind]}</span> {text}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import type { Result } from '../../../sim/types';
import { getLang, t, tf } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import { batterySeries, runs, type Run } from '../timelineModel';
import styles from './TimelineTracks.module.css';

interface Props {
  result: Result;
  initialPct: number;
  minPct: number;
  position: number;
}

const BAND_H = 20;
const BATTERY_H = 100;

function toPoints(series: readonly number[], from: number, to: number): string {
  return series
    .slice(from, to + 1)
    .map((pct, offset) => `${from + offset},${Number((BATTERY_H - pct).toFixed(3))}`)
    .join(' ');
}

function Markers({ total, height, position, failureHour }: {
  total: number;
  height: number;
  position: number;
  failureHour: number | null;
}) {
  return (
    <>
      {failureHour !== null ? (
        <line
          data-role="failure"
          className={styles.failure}
          x1={failureHour}
          x2={failureHour}
          y1={0}
          y2={height}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <line
        data-role="cursor"
        className={styles.cursor}
        x1={Math.min(position, total)}
        x2={Math.min(position, total)}
        y1={0}
        y2={height}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function Band({ label, summary, bands, tone, total, position, failureHour }: {
  label: string;
  summary: string;
  bands: Run[];
  tone: 'sun' | 'earth';
  total: number;
  position: number;
  failureHour: number | null;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <svg
        className={styles.band}
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${total} ${BAND_H}`}
        preserveAspectRatio="none"
      >
        <rect className={styles.empty} x={0} y={0} width={total} height={BAND_H} />
        {bands.map((band) => (
          <rect
            key={band.start}
            data-role={tone}
            className={styles[tone]}
            x={band.start}
            y={0}
            width={band.length}
            height={BAND_H}
          />
        ))}
        <Markers total={total} height={BAND_H} position={position} failureHour={failureHour} />
      </svg>
      <span className={styles.aside} />
    </div>
  );
}

export function TimelineTracks({ result, initialPct, minPct, position }: Props) {
  const lang = getLang();
  const total = result.hours.length;
  const failureHour = result.failure?.hour ?? null;
  const series = batterySeries(result, initialPct);
  const litCount = result.hours.filter((hour) => hour.sunlit).length;
  const earthCount = result.hours.filter((hour) => hour.earthVisible).length;
  const pct = (value: number) => formatNumber(value, lang);

  return (
    <div className={styles.tracks}>
      <Band
        label={t('timeline.sun', lang)}
        summary={tf('timeline.sunSummary', { count: litCount, total }, lang)}
        bands={runs(result.hours.map((hour) => hour.sunlit))}
        tone="sun"
        total={total}
        position={position}
        failureHour={failureHour}
      />
      <Band
        label={t('timeline.earth', lang)}
        summary={tf('timeline.earthSummary', { count: earthCount, total }, lang)}
        bands={runs(result.hours.map((hour) => hour.earthVisible))}
        tone="earth"
        total={total}
        position={position}
        failureHour={failureHour}
      />
      <div className={styles.row}>
        <span className={styles.label}>{t('timeline.battery', lang)}</span>
        <svg
          className={styles.battery}
          role="img"
          aria-label={tf(
            'timeline.batterySummary',
            { min: pct(Math.min(...series)), max: pct(Math.max(...series)), limit: pct(minPct) },
            lang,
          )}
          viewBox={`0 0 ${total} ${BATTERY_H}`}
          preserveAspectRatio="none"
        >
          <line
            data-role="min"
            className={styles.minLine}
            x1={0}
            x2={total}
            y1={BATTERY_H - minPct}
            y2={BATTERY_H - minPct}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            data-role="charge"
            className={styles.charge}
            points={toPoints(series, 0, failureHour ?? total)}
            vectorEffect="non-scaling-stroke"
          />
          {failureHour !== null && failureHour < total ? (
            <polyline
              data-role="continuation"
              className={styles.continuation}
              points={toPoints(series, failureHour, total)}
              vectorEffect="non-scaling-stroke"
            >
              <title>{t('timeline.continuation', lang)}</title>
            </polyline>
          ) : null}
          <Markers total={total} height={BATTERY_H} position={position} failureHour={failureHour} />
        </svg>
        <span className={styles.aside}>{tf('timeline.minLine', { pct: pct(minPct) }, lang)}</span>
      </div>
    </div>
  );
}

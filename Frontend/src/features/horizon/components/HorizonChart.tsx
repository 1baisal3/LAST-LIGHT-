import type { KeyboardEvent, PointerEvent } from 'react';
import type { BodiesAt, SkyPoint } from '../horizonModel';
import styles from './HorizonProfile.module.css';

export const VIEW_W = 640;
export const VIEW_H = 240;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 26;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

export interface ChartLabels {
  aria: string;
  directions: [string, string, string, string];
  cursor: string | null;
}

interface Props {
  line: readonly SkyPoint[];
  path: readonly SkyPoint[][];
  bodies: BodiesAt;
  range: { min: number; max: number };
  cursorAz: number | null;
  labels: ChartLabels;
  onCursor: (az: number | null) => void;
  onKey: (event: KeyboardEvent<SVGSVGElement>) => void;
}

export function azFromViewX(viewX: number): number {
  const az = ((viewX - PAD_L) / PLOT_W) * 360;
  return Math.min(360, Math.max(0, Math.round(az)));
}

function x(az: number): number {
  return PAD_L + (az / 360) * PLOT_W;
}

function yOf(range: { min: number; max: number }) {
  return (el: number) => PAD_T + ((range.max - el) / (range.max - range.min)) * PLOT_H;
}

function points(list: readonly SkyPoint[], y: (el: number) => number): string {
  return list.map((point) => `${x(point.az).toFixed(1)},${y(point.el).toFixed(1)}`).join(' ');
}

function gridSteps(range: { min: number; max: number }): number[] {
  const span = range.max - range.min;
  const step = span > 40 ? 20 : span > 20 ? 10 : 5;
  const out: number[] = [];
  for (let el = Math.ceil(range.min / step) * step; el <= range.max; el += step) out.push(el);
  return out;
}

export function HorizonChart({ line, path, bodies, range, cursorAz, labels, onCursor, onKey }: Props) {
  const y = yOf(range);
  const bottom = PAD_T + PLOT_H;
  const terrain = `${x(0)},${bottom} ${points(line, y)} ${x(360)},${bottom}`;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    onCursor(azFromViewX(((event.clientX - box.left) / box.width) * VIEW_W));
  };

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={labels.aria}
      tabIndex={0}
      onPointerMove={onPointerMove}
      onPointerLeave={() => onCursor(null)}
      onKeyDown={onKey}
      onBlur={() => onCursor(null)}
    >
      {gridSteps(range).map((el) => (
        <g key={`el${el}`}>
          <line className={el === 0 ? styles.zero : styles.grid} x1={PAD_L} x2={VIEW_W - PAD_R} y1={y(el)} y2={y(el)} />
          <text className={styles.tick} x={PAD_L - 6} y={y(el) + 4} textAnchor="end">
            {`${el}°`}
          </text>
        </g>
      ))}
      {[0, 90, 180, 270, 360].map((az, index) => (
        <text key={`az${az}`} className={styles.tick} x={x(az)} y={VIEW_H - 8} textAnchor="middle">
          {`${labels.directions[index % 4]} ${az}°`}
        </text>
      ))}
      <polygon className={styles.terrain} points={terrain} />
      {path.map((segment, index) => (
        <polyline key={`sun${index}`} className={styles.sunPath} points={points(segment, y)} />
      ))}
      <circle
        className={bodies.sun.visible ? styles.sun : `${styles.sun} ${styles.hidden}`}
        cx={x(bodies.sun.az)}
        cy={y(bodies.sun.el)}
        r={7}
      />
      <circle
        className={bodies.earth.visible ? styles.earth : `${styles.earth} ${styles.hidden}`}
        cx={x(bodies.earth.az)}
        cy={y(bodies.earth.el)}
        r={6}
      />
      {cursorAz !== null && labels.cursor !== null ? (
        <g className={styles.cursor}>
          <line x1={x(cursorAz)} x2={x(cursorAz)} y1={PAD_T} y2={bottom} />
          <text
            x={Math.min(x(cursorAz) + 6, VIEW_W - PAD_R - 4)}
            y={PAD_T + 12}
            textAnchor={cursorAz > 300 ? 'end' : 'start'}
          >
            {labels.cursor}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

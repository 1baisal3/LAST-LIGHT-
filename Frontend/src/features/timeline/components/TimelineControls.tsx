import { getLang, t, tf } from '../../../shared/i18n';
import { SPEEDS, type Speed } from '../timelineModel';
import styles from './TimelineControls.module.css';

interface Props {
  position: number;
  max: number;
  playing: boolean;
  speed: Speed;
  timeLabel: string;
  onTogglePlay: () => void;
  onSpeed: (speed: Speed) => void;
  onSelect: (position: number) => void;
}

export function TimelineControls({
  position,
  max,
  playing,
  speed,
  timeLabel,
  onTogglePlay,
  onSpeed,
  onSelect,
}: Props) {
  const lang = getLang();
  const positionText = tf('timeline.position', { hour: position, total: max }, lang);

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.play} aria-pressed={playing} onClick={onTogglePlay}>
        {playing ? t('timeline.pause', lang) : t('timeline.play', lang)}
      </button>

      <div className={styles.speeds} role="group" aria-label={t('timeline.speed', lang)}>
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.speed}
            aria-pressed={value === speed}
            onClick={() => onSpeed(value)}
          >
            {tf('timeline.speedValue', { speed: value }, lang)}
          </button>
        ))}
      </div>

      <input
        className={styles.slider}
        type="range"
        min={0}
        max={max}
        step={1}
        value={position}
        aria-label={t('timeline.cursor', lang)}
        aria-valuetext={`${positionText}, ${timeLabel}`}
        onChange={(event) => onSelect(Number(event.currentTarget.value))}
      />

      <output className={styles.readout}>
        <span>{positionText}</span>
        <span className={styles.time}>{timeLabel}</span>
      </output>
    </div>
  );
}

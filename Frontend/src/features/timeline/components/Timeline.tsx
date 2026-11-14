import type { KeyboardEvent } from 'react';
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { formatUtc } from '../../../shared/lib/format';
import { clampPosition, keyToStep, lastPosition, positionTime } from '../timelineModel';
import { usePlayback } from '../usePlayback';
import {
  hourSelected,
  hourStepped,
  playStopped,
  playTicked,
  playToggled,
  speedChanged,
} from '../viewSlice';
import styles from './Timeline.module.css';
import { TimelineControls } from './TimelineControls';
import { TimelineTracks } from './TimelineTracks';

export function Timeline() {
  const dispatch = useAppDispatch();
  const lang = getLang();
  const result = useAppSelector((state) => state.result.result);
  const status = useAppSelector((state) => state.result.status);
  const plan = useAppSelector((state) => state.plan.plan);
  const windowStart = useAppSelector((state) => state.dataset.dataset?.sites.window.start ?? null);
  const view = useAppSelector((state) => state.view);

  const onTick = useCallback(() => dispatch(playTicked()), [dispatch]);
  usePlayback(view.playing && result !== null, view.speed, onTick);

  const title = <h2 className={styles.title}>{t('timeline.title', lang)}</h2>;

  if (!result || !windowStart) {
    return (
      <section className={styles.timeline} aria-label={t('timeline.title', lang)}>
        {title}
        <p className={styles.empty}>{t('timeline.empty', lang)}</p>
      </section>
    );
  }

  const position = clampPosition(result, view.selectedHour);
  const recalculating = status === 'running';

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    const step = keyToStep(event.key);
    if (step === null) return;
    event.preventDefault();
    dispatch(hourStepped(step));
  };

  return (
    <section
      className={styles.timeline}
      aria-label={t('timeline.title', lang)}
      aria-busy={recalculating}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <header className={styles.header}>
        {title}
        {recalculating ? (
          <span className={styles.busy} role="status">
            {t('timeline.recalculating', lang)}
          </span>
        ) : null}
      </header>

      <div className={recalculating ? styles.stale : undefined}>
        <TimelineTracks
          result={result}
          initialPct={plan.initialPct}
          minPct={plan.minPct}
          position={position}
        />
      </div>

      <TimelineControls
        position={position}
        max={lastPosition(result)}
        playing={view.playing}
        speed={view.speed}
        timeLabel={formatUtc(positionTime(windowStart, plan.startIndex, position), lang)}
        onTogglePlay={() => dispatch(playToggled())}
        onSpeed={(speed) => dispatch(speedChanged(speed))}
        onSelect={(next) => {
          dispatch(playStopped());
          dispatch(hourSelected(next));
        }}
      />
    </section>
  );
}

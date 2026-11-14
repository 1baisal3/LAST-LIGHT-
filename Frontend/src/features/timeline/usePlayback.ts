import { useEffect, useRef } from 'react';
import { playStepMs, type Speed } from './timelineModel';

export function usePlayback(playing: boolean, speed: Speed, onTick: () => void): void {
  const tick = useRef(onTick);

  useEffect(() => {
    tick.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tick.current(), playStepMs(speed));
    return () => clearInterval(id);
  }, [playing, speed]);
}

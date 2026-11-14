import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from './timelineModel';
import { usePlayback } from './usePlayback';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePlayback', () => {
  it('does nothing while paused', () => {
    const onTick = vi.fn();
    renderHook(() => usePlayback(false, 1, onTick));
    vi.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('ticks once per second at 1x', () => {
    const onTick = vi.fn();
    renderHook(() => usePlayback(true, 1, onTick));
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('ticks 12 times per second at 12x', () => {
    const onTick = vi.fn();
    renderHook(() => usePlayback(true, 12, onTick));
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(12);
  });

  it('stops ticking when paused', () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(({ playing }) => usePlayback(playing, 4, onTick), {
      initialProps: { playing: true },
    });
    vi.advanceTimersByTime(500);
    rerender({ playing: false });
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('switches speed without restarting from scratch', () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(({ speed }: { speed: Speed }) => usePlayback(true, speed, onTick), {
      initialProps: { speed: 1 as Speed },
    });
    vi.advanceTimersByTime(1000);
    rerender({ speed: 4 });
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(5);
  });

  it('calls the latest callback after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onTick }) => usePlayback(true, 1, onTick), {
      initialProps: { onTick: first },
    });
    rerender({ onTick: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

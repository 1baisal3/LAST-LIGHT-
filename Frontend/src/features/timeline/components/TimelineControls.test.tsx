import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from '../timelineModel';
import { TimelineControls } from './TimelineControls';

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof TimelineControls>[0]> = {}) {
  const props = {
    position: 42,
    max: 168,
    playing: false,
    speed: 1 as Speed,
    timeLabel: '02.01.2026, 18:00 UTC',
    onTogglePlay: vi.fn(),
    onSpeed: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<TimelineControls {...props} />);
  return props;
}

describe('TimelineControls', () => {
  it('shows Play when paused and Pause when playing', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Пуск' }).getAttribute('aria-pressed')).toBe('false');
    cleanup();
    setup({ playing: true });
    expect(screen.getByRole('button', { name: 'Пауза' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles play on click', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Пуск' }));
    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('offers exactly the speeds 1x, 4x and 12x and marks the current one', () => {
    setup({ speed: 4 });
    const group = screen.getByRole('group', { name: 'Скорость' });
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['1×', '4×', '12×']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('reports the chosen speed', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '12×' }));
    expect(props.onSpeed).toHaveBeenCalledWith(12);
  });

  it('has a slider over 0..168 that reads out the hour and the UTC time', () => {
    setup();
    const slider = screen.getByRole('slider', { name: 'Час на шкале' });
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('168');
    expect((slider as HTMLInputElement).value).toBe('42');
    expect(slider.getAttribute('aria-valuetext')).toBe('Час 42 из 168, 02.01.2026, 18:00 UTC');
  });

  it('reports a new position when the slider moves', () => {
    const props = setup();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '100' } });
    expect(props.onSelect).toHaveBeenCalledWith(100);
  });
});

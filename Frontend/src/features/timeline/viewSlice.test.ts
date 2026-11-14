import { describe, expect, it } from 'vitest';
import {
  hourSelected,
  hourStepped,
  MAX_POSITION,
  playStopped,
  playTicked,
  playToggled,
  speedChanged,
  viewReducer,
  type ViewState,
} from './viewSlice';

const start: ViewState = { selectedHour: 0, playing: false, speed: 1 };

function run(state: ViewState, ...actions: Parameters<typeof viewReducer>[1][]): ViewState {
  return actions.reduce(viewReducer, state);
}

describe('viewSlice', () => {
  it('keeps the selected hour inside 0..168', () => {
    expect(run(start, hourSelected(-3)).selectedHour).toBe(0);
    expect(run(start, hourSelected(500)).selectedHour).toBe(MAX_POSITION);
    expect(run(start, hourSelected(14.6)).selectedHour).toBe(15);
  });

  it('steps one hour with the arrow keys and stops play', () => {
    const playing = { ...start, selectedHour: 10, playing: true };
    const next = run(playing, hourStepped(1));
    expect(next.selectedHour).toBe(11);
    expect(next.playing).toBe(false);
    expect(run(start, hourStepped(-1)).selectedHour).toBe(0);
  });

  it('accepts only the speeds 1, 4 and 12', () => {
    expect(run(start, speedChanged(12)).speed).toBe(12);
  });

  it('advances one hour per tick while playing', () => {
    const state = run(start, playToggled(), playTicked(), playTicked());
    expect(state.selectedHour).toBe(2);
    expect(state.playing).toBe(true);
  });

  it('ignores ticks when paused', () => {
    expect(run(start, playTicked()).selectedHour).toBe(0);
  });

  it('stops by itself at 168', () => {
    const nearEnd = { ...start, selectedHour: 167, playing: true };
    const state = run(nearEnd, playTicked());
    expect(state.selectedHour).toBe(168);
    expect(state.playing).toBe(false);
  });

  it('restarts from 0 when play is pressed at the end', () => {
    const atEnd = { ...start, selectedHour: 168 };
    const state = run(atEnd, playToggled());
    expect(state.selectedHour).toBe(0);
    expect(state.playing).toBe(true);
  });

  it('pauses on a second press and on playStopped', () => {
    expect(run(start, playToggled(), playToggled()).playing).toBe(false);
    expect(run(start, playToggled(), playStopped()).playing).toBe(false);
  });
});

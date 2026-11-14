import { describe, expect, it } from 'vitest';
import { describeVerdict, type VerdictInput } from './verdictModel';
import { resultOf, WINDOW_START } from './scenarios.testutil';

function input(patch: Partial<VerdictInput>): VerdictInput {
  return {
    status: 'idle',
    result: null,
    error: null,
    startIndex: 0,
    windowStart: WINDOW_START,
    lang: 'ru',
    ...patch,
  };
}

describe('describeVerdict', () => {
  it('shows a dash and no colour without a result', () => {
    const model = describeVerdict(input({}));
    expect(model.kind).toBe('none');
    expect(model.title).toBe('—');
    expect(model.busy).toBe(false);
    expect(model.hour).toBeNull();
  });

  it('shows a dash and a busy flag while the first calculation runs', () => {
    const model = describeVerdict(input({ status: 'running' }));
    expect(model.kind).toBe('none');
    expect(model.busy).toBe(true);
  });

  it('S2: survives 7 days', () => {
    const model = describeVerdict(input({ result: resultOf('S2') }));
    expect(model.kind).toBe('ok');
    expect(model.title).toBe('Выживает 7 суток');
    expect(model.reason).toBeNull();
    expect(model.hour).toBeNull();
  });

  it('S4: failure by Earth at hour 16', () => {
    const model = describeVerdict(input({ result: resultOf('S4') }));
    expect(model.kind).toBe('fail');
    expect(model.title).toBe('Отказ на 16-м часу');
    expect(model.reason).toBe('связь с Землёй');
    expect(model.time).toContain('01.01.2026');
    expect(model.time).toContain('16:00');
    expect(model.time).toContain('UTC');
    expect(model.hour).toBe(16);
  });

  it('S6: failure by battery at hour 15, 2026-01-01 15:00 UTC', () => {
    const model = describeVerdict(input({ result: resultOf('S6') }));
    expect(model.kind).toBe('fail');
    expect(model.title).toBe('Отказ на 15-м часу');
    expect(model.reason).toBe('батарея');
    expect(model.time).toBe('01.01.2026, 15:00:00 UTC');
    expect(model.hour).toBe(15);
  });

  it('S8: failure at hour 0', () => {
    const model = describeVerdict(input({ result: resultOf('S8') }));
    expect(model.title).toBe('Отказ на 0-м часу');
    expect(model.reason).toBe('батарея');
    expect(model.time).toBe('01.01.2026, 00:00:00 UTC');
    expect(model.hour).toBe(0);
  });

  it('adds the start offset to the failure time', () => {
    const model = describeVerdict(input({ result: resultOf('S6'), startIndex: 24 }));
    expect(model.time).toBe('02.01.2026, 15:00:00 UTC');
  });

  it('writes the time in English too', () => {
    const model = describeVerdict(input({ result: resultOf('S6'), lang: 'en' }));
    expect(model.title).toBe('Failure at hour 15');
    expect(model.reason).toBe('battery');
    expect(model.time).toContain('3:00:00 PM UTC');
  });

  it('mutes an old result while recalculating and does not offer its hour', () => {
    const model = describeVerdict(input({ status: 'running', result: resultOf('S6') }));
    expect(model.stale).toBe(true);
    expect(model.busy).toBe(true);
    expect(model.time).toBeNull();
    expect(model.hour).toBeNull();
    expect(model.kind).toBe('fail');
  });

  it('is never green on a plan error and shows its text', () => {
    const model = describeVerdict(
      input({
        status: 'error',
        result: resultOf('S2'),
        error: { code: 'INVALID_PLAN', field: 'capacityWh', message: 'capacityWh must be a finite number > 0' },
      }),
    );
    expect(model.kind).toBe('error');
    expect(model.title).toBe('Расчёт не выполнен');
    expect(model.detail).toBe('Число должно быть больше 0.');
    expect(model.hour).toBeNull();
  });

  it('keeps the message of a worker error without a field', () => {
    const model = describeVerdict(
      input({ status: 'error', error: { code: 'INVALID_PLAN', field: null, message: 'unknown site "x"' } }),
    );
    expect(model.kind).toBe('error');
    expect(model.detail).toBe('unknown site "x"');
  });
});

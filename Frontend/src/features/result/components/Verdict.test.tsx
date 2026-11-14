import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resultOf, WINDOW_START } from '../scenarios.testutil';
import { describeVerdict, type VerdictInput } from '../verdictModel';
import { KpiRowView } from './KpiRow';
import { VerdictView } from './Verdict';

function renderVerdict(patch: Partial<VerdictInput>): string {
  const model = describeVerdict({
    status: 'idle',
    result: null,
    error: null,
    startIndex: 0,
    windowStart: WINDOW_START,
    lang: 'ru',
    ...patch,
  });
  return renderToStaticMarkup(<VerdictView model={model} onShowHour={() => {}} />);
}

describe('Verdict', () => {
  it('S2: green banner without a failure block', () => {
    const html = renderVerdict({ result: resultOf('S2') });
    expect(html).toContain('data-kind="ok"');
    expect(html).toContain('Выживает 7 суток');
    expect(html).not.toContain('Показать час');
  });

  it('S4: red banner, Earth, hour 16 and a button', () => {
    const html = renderVerdict({ result: resultOf('S4') });
    expect(html).toContain('data-kind="fail"');
    expect(html).toContain('Отказ на 16-м часу');
    expect(html).toContain('связь с Землёй');
    expect(html).toContain('16:00:00 UTC');
    expect(html).toContain('Показать час');
  });

  it('S6: red banner, battery, hour 15', () => {
    const html = renderVerdict({ result: resultOf('S6') });
    expect(html).toContain('Отказ на 15-м часу');
    expect(html).toContain('батарея');
    expect(html).toContain('01.01.2026, 15:00:00 UTC');
    expect(html).toContain('Показать час');
  });

  it('S8: failure at hour 0 still offers the button', () => {
    const html = renderVerdict({ result: resultOf('S8') });
    expect(html).toContain('Отказ на 0-м часу');
    expect(html).toContain('Показать час');
  });

  it('has no colour state and no numbers without a result', () => {
    const html = renderVerdict({});
    expect(html).toContain('data-kind="none"');
    expect(html).toContain('—');
    expect(html).not.toContain('Выживает');
  });

  it('shows a busy indicator and mutes the old result while recalculating', () => {
    const html = renderVerdict({ status: 'running', result: resultOf('S2') });
    expect(html).toContain('Пересчитываем…');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-stale=""');
  });

  it('shows the error text and not a green verdict', () => {
    const html = renderVerdict({
      status: 'error',
      error: { code: 'OUT_OF_WINDOW', field: 'startIndex', message: 'mission does not fit into the data window' },
    });
    expect(html).toContain('data-kind="error"');
    expect(html).toContain('Выберите допустимую дату старта.');
    expect(html).not.toContain('data-kind="ok"');
  });
});

describe('KpiRow', () => {
  it('S2: four tiles with the numbers from Result.kpis', () => {
    const html = renderToStaticMarkup(<KpiRowView result={resultOf('S2')} stale={false} />);
    expect(html.match(/<dt/g)).toHaveLength(4);
    expect(html).toContain('75\u00a0%');
    expect(html).toContain('5\u00a0ч');
    expect(html).toContain('16\u00a0ч');
    expect(html).toContain('79,2\u00a0%');
    expect(html).not.toContain('отказ');
  });

  it('S6: the battery tile is marked as the reason of failure', () => {
    const html = renderToStaticMarkup(<KpiRowView result={resultOf('S6')} stale={false} />);
    expect(html.match(/отказ/g)).toHaveLength(1);
    expect(html).toContain('0\u00a0%');
  });

  it('S4: the contact tile is marked as the reason of failure', () => {
    const html = renderToStaticMarkup(<KpiRowView result={resultOf('S4')} stale={false} />);
    expect(html.match(/отказ/g)).toHaveLength(1);
  });

  it('shows dashes without a result and mutes numbers while recalculating', () => {
    const empty = renderToStaticMarkup(<KpiRowView result={null} stale={false} />);
    expect(empty.match(/—/g)).toHaveLength(4);
    const stale = renderToStaticMarkup(<KpiRowView result={resultOf('S2')} stale />);
    expect(stale).toContain('aria-busy="true"');
  });
});

import { configureStore } from '@reduxjs/toolkit';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { datasetActivated, datasetReducer } from '../../datasets/datasetSlice';
import { makeDemoDataset } from '../../datasets/demo';
import { draftPatched, planPatched, planReducer } from '../planSlice';
import { MissionPanel } from './MissionPanel';

function render(prepare: (dispatch: (action: { type: string; payload?: unknown }) => unknown) => void = () => {}) {
  const store = configureStore({ reducer: { dataset: datasetReducer, plan: planReducer } });
  store.dispatch(datasetActivated(makeDemoDataset()));
  prepare(store.dispatch as (action: { type: string; payload?: unknown }) => unknown);
  return renderToStaticMarkup(
    <Provider store={store}>
      <MissionPanel />
    </Provider>,
  );
}

describe('MissionPanel', () => {
  it('shows both sites with coordinates and highlights the selected one', () => {
    const html = render();
    expect(html).toContain('Фикстура A (синтетика)');
    expect(html).toContain('Фикстура B (синтетика)');
    expect(html).toContain('89,9° ю. ш., 0° в. д.');
    expect(html).toContain('89,8° ю. ш., 0° в. д.');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('offers only the valid start dates', () => {
    const html = render();
    expect(html.match(/<option/g)).toHaveLength(2);
    expect(html).toContain('1 января 2026 г.');
    expect(html).toContain('2 января 2026 г.');
    expect(html).toContain('UTC');
  });

  it('shows the fixed duration without a control', () => {
    const html = render();
    expect(html).toContain('7 суток (168 ч)');
  });

  it('labels every field and hides the P1 elements when the data has none', () => {
    const html = render();
    for (const label of [
      'Мощность панели',
      'Нагрузка',
      'Ёмкость батареи',
      'Начальный заряд',
      'Минимальный заряд',
      'Проверять связь с Землёй',
      'Допустимый перерыв связи',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('Обогрев');
    expect(html).not.toContain('Мачта');
  });

  it('shows the heater field only when the data allows heating', () => {
    const store = configureStore({ reducer: { dataset: datasetReducer, plan: planReducer } });
    const dataset = makeDemoDataset();
    store.dispatch(
      datasetActivated({
        ...dataset,
        provenance: { ...dataset.provenance, capabilities: { ...dataset.provenance.capabilities, heater: true } },
      }),
    );
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <MissionPanel />
      </Provider>,
    );
    expect(html).toContain('Обогреватель');
  });

  it('shows the error text at the invalid field', () => {
    const html = render((dispatch) => {
      dispatch(draftPatched({ capacityWh: 0, minPct: 101 }));
    });
    expect(html).toContain('Число должно быть больше 0.');
    expect(html).toContain('Значение от 0 до 100 %.');
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
  });

  it('asks for a number when a field is cleared', () => {
    const html = render((dispatch) => {
      dispatch(draftPatched({ loadW: Number.NaN }));
    });
    expect(html).toContain('Введите число.');
  });

  it('switches the contact check off and disables its field', () => {
    const on = render();
    expect(on).toContain('checked=""');
    const off = render((dispatch) => {
      dispatch(planPatched({ maxBlackoutH: null }));
    });
    expect(off).not.toContain('checked=""');
    expect(off).toContain('disabled=""');
  });
});

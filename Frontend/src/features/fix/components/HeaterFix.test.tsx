import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import type { Dataset } from '../../datasets/types';
import { planPatched } from '../../plan/planSlice';
import { FixPanel } from './FixPanel';

const SHADOW_CASE = { siteId: 'fixture-b', startIndex: 24, maxBlackoutH: 12, capacityWh: 1000 };

function withHeater(enabled: boolean): Dataset {
  const dataset = makeDemoDataset();
  return {
    ...dataset,
    provenance: { ...dataset.provenance, capabilities: { ...dataset.provenance.capabilities, heater: enabled } },
  };
}

function syncWorker(): WorkerLike {
  const handle = createHandler();
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  return {
    postMessage(message) {
      const response = handle(message);
      listeners.forEach((listener) => listener({ data: response }));
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
}

function setup(enabled = true) {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <FixPanel />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(withHeater(enabled)));
  });
  return store;
}

function run(store: ReturnType<typeof setup>, patch: Parameters<typeof planPatched>[0]) {
  act(() => {
    store.dispatch(planPatched(patch));
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Обогрев' }));
  fireEvent.click(screen.getByRole('button', { name: 'Рассчитать обогрев' }));
}

const status = () => screen.getByRole('status');

afterEach(cleanup);

describe('heater tab', () => {
  it('is hidden without the heater capability', () => {
    setup(false);
    expect(screen.queryByRole('tab', { name: 'Обогрев' })).toBeNull();
  });

  it('says heating costs nothing without shadow', () => {
    const store = setup();
    run(store, {});
    expect(status().textContent).toBe('Тени нет: обогрев не расходует энергию');
  });

  it('shows the headroom when the current heater is fine', () => {
    const store = setup();
    run(store, SHADOW_CASE);
    expect(status().textContent).toMatch(/^Аппарат выживает с обогревом до \d+ Вт \(сейчас 0 Вт\)$/);
    expect(screen.queryByRole('button', { name: 'Применить' })).toBeNull();
  });

  it('proposes a lower heater, compares and applies it', () => {
    const store = setup();
    run(store, { ...SHADOW_CASE, heaterW: 200 });
    expect(store.getState().result.result?.failure?.reason).toBe('battery');
    const text = status().textContent ?? '';
    expect(text).toMatch(/^Обогрев нужно снизить до \d+ Вт \(сейчас 200 Вт\)$/);
    const target = Number(/до (\d+) Вт/.exec(text)![1]);
    const head = within(screen.getByRole('table')).getByRole('row', { name: /Мощность обогрева/ });
    expect(head.textContent).toContain('200 Вт');
    expect(head.textContent).toContain(`${target} Вт`);

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(store.getState().plan.plan.heaterW).toBe(target);
    expect(store.getState().result.result?.ok).toBe(true);
    expect(status().textContent).toBe(`Применено: обогрев ${target} Вт`);
    expect(document.activeElement).toBe(status());
  });

  it('explains an earth failure', () => {
    const store = setup();
    run(store, { siteId: 'fixture-b', startIndex: 0 });
    expect(status().textContent).toBe('Обогрев ни при чём: отказ по связи с Землёй');
  });

  it('explains a battery that fails even without heating', () => {
    const store = setup();
    run(store, { ...SHADOW_CASE, capacityWh: 400 });
    expect(status().textContent).toBe(
      'Аппарат не выживает даже без обогрева: нужна батарея больше или другая дата',
    );
  });
});

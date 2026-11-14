import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { messageOf } from '../../shared/api/errors';
import { makeDemoDataset } from './demo';
import { useGetLatestDatasetQuery } from './datasetsApi';
import { datasetActivated } from './datasetSlice';
import { parseDataset } from './parse';
import type { Dataset } from './types';

export type DataSource = 'demo' | 'api';

export interface DatasetStatus {
  status: 'loading' | 'ready' | 'error';
  dataset: Dataset | null;
  error: string | null;
  retry: () => void;
}

export function readDataSource(value: unknown = import.meta.env.VITE_DATA_SOURCE): DataSource {
  return value === 'api' ? 'api' : 'demo';
}

export function loadDemoDataset(): { dataset: Dataset; error: null } | { dataset: null; error: string } {
  try {
    return { dataset: parseDataset(makeDemoDataset()), error: null };
  } catch (error) {
    return { dataset: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function useDataset(source: DataSource = readDataSource()): DatasetStatus {
  const dispatch = useDispatch();
  const [attempt, setAttempt] = useState(0);

  const api = useGetLatestDatasetQuery(undefined, { skip: source !== 'api' });
  const demo = useMemo(() => (source === 'demo' ? loadDemoDataset() : null), [source, attempt]);

  const { refetch } = api;
  const retry = useCallback(() => {
    if (source === 'api') {
      void refetch();
    } else {
      setAttempt((value) => value + 1);
    }
  }, [source, refetch]);

  let dataset: Dataset | null = null;
  let error: string | null = null;
  let status: DatasetStatus['status'] = 'loading';

  if (source === 'demo' && demo) {
    dataset = demo.dataset;
    error = demo.error;
    status = demo.dataset ? 'ready' : 'error';
  } else if (source === 'api') {
    if (api.isError) {
      status = 'error';
      error = messageOf(api.error);
    } else if (api.data) {
      dataset = api.data;
      status = 'ready';
    }
  }

  useEffect(() => {
    if (dataset) dispatch(datasetActivated(dataset));
  }, [dataset, dispatch]);

  return { status, dataset, error, retry };
}

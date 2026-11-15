import { createListenerMiddleware } from '@reduxjs/toolkit';
import { datasetActivated } from '../features/datasets/datasetSlice';
import { planPatched } from '../features/plan/planSlice';
import { decodePlanHash } from '../features/share/planLink';
import { linkRead } from '../features/share/shareSlice';

function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export function createShareListener(readHash: () => string = currentHash) {
  const middleware = createListenerMiddleware();
  let read = false;

  middleware.startListening({
    actionCreator: datasetActivated,
    effect: (action, api) => {
      if (read) return;
      read = true;
      const { sites, provenance } = action.payload;
      const link = decodePlanHash(readHash(), sites, provenance.capabilities);
      if (link.kind === 'plan') {
        api.dispatch(planPatched(link.plan));
        api.dispatch(linkRead('applied'));
      } else if (link.kind === 'broken') {
        api.dispatch(linkRead('broken'));
      }
    },
  });

  return middleware;
}

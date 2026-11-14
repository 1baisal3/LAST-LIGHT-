import { DataState, useDataset } from './features/datasets';
import { MissionPanel } from './features/plan';
import { KpiRow, Verdict } from './features/result';
import { Scene } from './features/scene';
import { Timeline } from './features/timeline';
import { WhyPanel } from './features/why';
import { AppShell } from './shared/layout/AppShell';

export function App() {
  const data = useDataset();

  if (data.status !== 'ready') {
    return (
      <AppShell
        side={null}
        main={<DataState status={data.status} message={data.error} onRetry={data.retry} />}
      />
    );
  }

  return (
    <AppShell
      side={<MissionPanel />}
      main={
        <>
          <Verdict />
          <KpiRow />
          <Scene />
          <Timeline />
          <WhyPanel />
        </>
      }
    />
  );
}

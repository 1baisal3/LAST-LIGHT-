import { Calendar } from './features/calendar';
import { DataState, DataStatusBar, useDataset } from './features/datasets';
import { MissionPanel } from './features/plan';
import { KpiRow, Verdict } from './features/result';
import { Scene } from './features/scene';
import { Timeline } from './features/timeline';
import { WhyPanel } from './features/why';
import { useLang } from './shared/i18n';
import { AppShell } from './shared/layout/AppShell';
import { Header } from './shared/layout/Header';

export function App() {
  useLang();
  const data = useDataset();

  if (data.status !== 'ready' || !data.dataset) {
    return (
      <AppShell
        header={<Header />}
        side={null}
        main={<DataState status={data.status === 'error' ? 'error' : 'loading'} message={data.error} onRetry={data.retry} />}
      />
    );
  }

  return (
    <AppShell
      header={<Header status={<DataStatusBar dataset={data.dataset} />} />}
      side={<MissionPanel />}
      main={
        <>
          <Verdict />
          <KpiRow />
          <Scene />
          <Timeline />
          <WhyPanel />
          <Calendar />
        </>
      }
    />
  );
}

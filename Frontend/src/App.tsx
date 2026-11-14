import { MissionPanel } from './features/plan';
import { Verdict } from './features/result';
import { Scene } from './features/scene';
import { Timeline } from './features/timeline';
import { WhyPanel } from './features/why';
import { AppShell } from './shared/layout/AppShell';

export function App() {
  return (
    <AppShell
      side={<MissionPanel />}
      main={
        <>
          <Verdict />
          <Scene />
          <Timeline />
          <WhyPanel />
        </>
      }
    />
  );
}

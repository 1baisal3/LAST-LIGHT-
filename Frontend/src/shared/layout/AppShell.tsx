import type { ReactNode } from 'react';
import styles from './AppShell.module.css';
import { Header } from './Header';

interface Props {
  header?: ReactNode;
  side: ReactNode;
  main: ReactNode;
}

export function AppShell({ header, side, main }: Props) {
  return (
    <div className={styles.shell}>
      {header ?? <Header />}
      <aside className={styles.side}>{side}</aside>
      <main className={styles.main}>{main}</main>
    </div>
  );
}

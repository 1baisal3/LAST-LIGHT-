import type { ReactNode } from 'react';
import styles from './AppShell.module.css';
import { Header } from './Header';

interface Props {
  header?: ReactNode;
  side: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
  bottom?: ReactNode;
}

export function AppShell({ header, side, main, aside = null, bottom = null }: Props) {
  return (
    <div className={styles.shell}>
      {header ?? <Header />}
      <main className={styles.body}>
        <div className={aside ? `${styles.layout} ${styles.withAside}` : styles.layout}>
          {side ? <aside className={styles.side}>{side}</aside> : null}
          <div className={styles.center}>{main}</div>
          {aside ? <div className={styles.aside}>{aside}</div> : null}
        </div>
        {bottom ? <div className={styles.bottom}>{bottom}</div> : null}
      </main>
    </div>
  );
}

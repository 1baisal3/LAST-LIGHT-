import type { SceneStateKey } from '../sceneState';
import styles from './Scene.module.css';

interface LanderProps {
  state: SceneStateKey;
}

const LIGHT_X = [280, 300, 320, 340];

export function Lander({ state }: LanderProps) {
  const out = state === 'failed' || state === 'dimming';
  const alert = state === 'danger' || state === 'noEarth';
  return (
    <g aria-hidden="true" className={`${styles.lander} ${styles[`lander_${state}`] ?? ''}`}>
      <rect x="170" y="226" width="110" height="10" className={styles.panel} />
      <rect x="360" y="226" width="110" height="10" className={styles.panel} />
      <line x1="280" y1="231" x2="290" y2="231" className={styles.strut} />
      <line x1="350" y1="231" x2="360" y2="231" className={styles.strut} />
      <rect x="290" y="200" width="60" height="42" rx="6" className={styles.body} />
      <line x1="320" y1="200" x2="320" y2="176" className={styles.strut} />
      <circle cx="320" cy="174" r="4" className={alert ? styles.beaconAlert : styles.beacon} />
      <line x1="296" y1="242" x2="284" y2="258" className={styles.strut} />
      <line x1="344" y1="242" x2="356" y2="258" className={styles.strut} />
      {LIGHT_X.map((x, index) => (
        <circle
          key={x}
          cx={x + 10}
          cy="214"
          r="3.5"
          className={out ? `${styles.light} ${styles.lightOut}` : styles.light}
          style={out ? { animationDelay: `${index * 150}ms` } : undefined}
        />
      ))}
    </g>
  );
}

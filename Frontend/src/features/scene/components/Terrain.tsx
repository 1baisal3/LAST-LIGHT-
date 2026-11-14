import styles from './Scene.module.css';

export function Terrain() {
  return (
    <g aria-hidden="true">
      <path
        className={styles.farHills}
        d="M0 230 L70 190 L130 215 L210 170 L300 220 L390 180 L470 214 L560 176 L640 212 L640 300 L0 300 Z"
      />
      <path
        className={styles.nearHills}
        d="M0 262 L90 238 L190 256 L300 232 L420 258 L540 240 L640 258 L640 300 L0 300 Z"
      />
    </g>
  );
}

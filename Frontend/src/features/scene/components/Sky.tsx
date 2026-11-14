import styles from './Scene.module.css';

interface SkyProps {
  earthVisible: boolean;
  sunLow: boolean;
}

export function Sky({ earthVisible, sunLow }: SkyProps) {
  return (
    <g aria-hidden="true">
      <rect x="0" y="0" width="640" height="300" className={styles.sky} />
      <g className={styles.sun} transform={`translate(${sunLow ? 520 : 470} ${sunLow ? 190 : 80})`}>
        <circle r="22" className={styles.sunDisc} />
        <circle r="32" className={styles.sunHalo} />
      </g>
      <g
        className={earthVisible ? styles.earth : `${styles.earth} ${styles.earthHidden}`}
        transform="translate(130 70)"
      >
        <circle r="16" className={styles.earthDisc} />
        <path d="M-8 -4 q6 -6 10 0 q-2 6 -8 6 z" className={styles.earthLand} />
      </g>
    </g>
  );
}

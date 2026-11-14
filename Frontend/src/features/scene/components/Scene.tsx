import { useAppSelector } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { clampPosition, intervalAt } from '../../timeline/timelineModel';
import { LOW_SUN_DEG, sceneState, sunElevationAt } from '../sceneState';
import { Lander } from './Lander';
import styles from './Scene.module.css';
import { Sky } from './Sky';
import { StateBadge } from './StateBadge';
import { Terrain } from './Terrain';

export function Scene() {
  const lang = getLang();
  const result = useAppSelector((state) => state.result.result);
  const plan = useAppSelector((state) => state.plan.plan);
  const dataset = useAppSelector((state) => state.dataset.dataset);
  const selectedHour = useAppSelector((state) => state.view.selectedHour);

  const title = t('scene.title', lang);
  const caption = t('scene.caption', lang);

  if (!result || result.hours.length === 0) {
    return (
      <section className={styles.scene} aria-label={title}>
        <h2 className={styles.title}>{title}</h2>
        <svg
          className={`${styles.svg} ${styles.loading}`}
          viewBox="0 0 640 300"
          role="img"
          aria-label={`${title}: ${t('scene.loading', lang)}`}
        >
          <Sky earthVisible={false} sunLow />
          <Terrain />
        </svg>
        <StateBadge state="loading" onBattery={false} earthLimitExceeded={false} />
        <p className={styles.caption}>{caption}</p>
      </section>
    );
  }

  const position = clampPosition(result, selectedHour);
  const site = dataset?.sites.sites.find((item) => item.id === plan.siteId);
  const sunEl = sunElevationAt(site?.hours, plan.startIndex, position);
  const { state, secondary, earthLimitExceeded } = sceneState({ result, plan, position, sunEl });
  const interval = intervalAt(result, position);
  const stateText = t(`scene.state.${state}`, lang);
  const label = earthLimitExceeded ? `${stateText}. ${t('scene.earthLimit', lang)}` : stateText;

  return (
    <section className={styles.scene} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <svg
        className={`${styles.svg} ${styles[`scene_${state}`] ?? ''}`}
        viewBox="0 0 640 300"
        role="img"
        aria-label={`${title}: ${label}`}
      >
        <Sky earthVisible={interval.earthVisible} sunLow={sunEl !== null && sunEl <= LOW_SUN_DEG} />
        <Terrain />
        <Lander state={state} />
      </svg>
      <StateBadge
        state={state}
        onBattery={secondary === 'onBattery'}
        earthLimitExceeded={earthLimitExceeded}
      />
      <p className={styles.caption}>{caption}</p>
    </section>
  );
}

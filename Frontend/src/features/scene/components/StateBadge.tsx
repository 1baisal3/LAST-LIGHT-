import { getLang, t } from '../../../shared/i18n';
import type { SceneStateKey } from '../sceneState';
import styles from './Scene.module.css';

export type BadgeState = SceneStateKey | 'loading';

const ICONS: Record<BadgeState, string> = {
  failed: '✕',
  dimming: '◐',
  noEarth: '⌀',
  danger: '!',
  charging: '↑',
  working: '●',
  loading: '—',
};

interface StateBadgeProps {
  state: BadgeState;
  onBattery: boolean;
  earthLimitExceeded: boolean;
}

export function StateBadge({ state, onBattery, earthLimitExceeded }: StateBadgeProps) {
  const lang = getLang();
  const label = state === 'loading' ? '—' : t(`scene.state.${state}`, lang);
  return (
    <div className={`${styles.badge} ${styles[`badge_${state}`] ?? ''}`} aria-live="polite">
      <span className={styles.badgeIcon} aria-hidden="true">
        {ICONS[state]}
      </span>
      <span className={styles.badgeText}>
        <span>{label}</span>
        {onBattery ? <span className={styles.badgeNote}>{t('scene.onBattery', lang)}</span> : null}
        {earthLimitExceeded ? (
          <span className={styles.badgeNote}>{t('scene.earthLimit', lang)}</span>
        ) : null}
      </span>
    </div>
  );
}

import { useId } from 'react';
import { t } from '../../../shared/i18n';
import { NumberField } from '../../../shared/ui/NumberField';
import styles from './BlackoutToggle.module.css';

interface Props {
  enabled: boolean;
  value: number;
  error?: string | undefined;
  onToggle: (enabled: boolean) => void;
  onChange: (value: number) => void;
  onCommit: (moveFocus: boolean) => void;
}

export function BlackoutToggle({ enabled, value, error, onToggle, onChange, onCommit }: Props) {
  const switchId = useId();

  return (
    <div className={styles.root}>
      <div className={styles.switch}>
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          className={styles.checkbox}
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <label htmlFor={switchId}>{t('plan.blackout')}</label>
      </div>
      <NumberField
        label={t('plan.maxBlackoutH')}
        unit={t('plan.unitH')}
        value={value}
        min={0}
        max={168}
        step={1}
        error={enabled ? error : undefined}
        disabled={!enabled}
        onChange={onChange}
        onCommit={onCommit}
      />
    </div>
  );
}

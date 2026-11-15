import { useAppDispatch, useAppSelector } from '../../../app/store';
import { getLang, t } from '../../../shared/i18n';
import { linkNoticeClosed } from '../shareSlice';
import styles from './Share.module.css';

export function LinkNotice() {
  const lang = getLang();
  const dispatch = useAppDispatch();
  const link = useAppSelector((state) => state.share.link);
  if (link !== 'broken') return null;
  return (
    <div className={styles.notice} role="alert">
      <span>{t('share.broken', lang)}</span>
      <button type="button" className={styles.button} onClick={() => dispatch(linkNoticeClosed())}>
        {t('share.close', lang)}
      </button>
    </div>
  );
}

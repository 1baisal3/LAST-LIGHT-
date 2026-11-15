import { useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { baseApi } from '../../../shared/api/baseApi';
import { loggedOut } from '../../../shared/api/session';
import { getLang, t } from '../../../shared/i18n';
import styles from './Auth.module.css';
import { AuthDialog } from './AuthDialog';

export function AccountMenu() {
  const lang = getLang();
  const dispatch = useAppDispatch();
  const username = useAppSelector((state) => (state.session.refresh ? state.session.username : null));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  if (username) {
    return (
      <div className={styles.account}>
        <span className={styles.user}>{username}</span>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            dispatch(loggedOut());
            dispatch(baseApi.util.resetApiState());
          }}
        >
          {t('auth.logout', lang)}
        </button>
      </div>
    );
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={styles.secondary} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t('auth.open', lang)}
      </button>
      {open ? <AuthDialog onClose={close} /> : null}
    </>
  );
}

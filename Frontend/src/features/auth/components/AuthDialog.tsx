import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { getLang, t } from '../../../shared/i18n';
import { fieldErrors, statusOf, useLoginMutation, useRegisterMutation } from '../authApi';
import styles from './Auth.module.css';

type Mode = 'login' | 'register';

interface Props {
  onClose: () => void;
}

export function AuthDialog({ onClose }: Props) {
  const lang = getLang();
  const titleId = useId();
  const baseId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const busy = loginState.isLoading || registerState.isLoading;

  useEffect(() => {
    firstRef.current?.focus();
  }, [mode]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  const failText = (error: unknown) => {
    const status = statusOf(error);
    if (status === 401) return t('auth.badCredentials', lang);
    if (status === 400) return t('auth.checkFields', lang);
    return t('auth.network', lang);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    if (mode === 'register') {
      const registered = await register({ username, email, password });
      if ('error' in registered) {
        setErrors(fieldErrors(registered.error));
        setMessage(failText(registered.error));
        return;
      }
    }
    const result = await login({ username, password });
    if ('error' in result) {
      setMessage(failText(result.error));
      return;
    }
    onClose();
  };

  const field = (
    name: 'username' | 'email' | 'password',
    value: string,
    set: (value: string) => void,
    type: string,
    autoComplete: string,
  ) => (
    <div className={styles.field}>
      <label htmlFor={`${baseId}-${name}`}>{t(`auth.${name}`, lang)}</label>
      <input
        id={`${baseId}-${name}`}
        ref={name === 'username' ? firstRef : undefined}
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${baseId}-${name}-error` : undefined}
        onChange={(event) => set(event.target.value)}
      />
      {errors[name] ? (
        <span id={`${baseId}-${name}-error`} className={styles.error}>
          {errors[name]}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className={styles.overlay} onKeyDown={onKeyDown}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.title}>
          {t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle', lang)}
        </h2>
        <form className={styles.form} onSubmit={submit} noValidate>
          {field('username', username, setUsername, 'text', 'username')}
          {mode === 'register' ? field('email', email, setEmail, 'email', 'email') : null}
          {field('password', password, setPassword, 'password', mode === 'login' ? 'current-password' : 'new-password')}
          <p className={styles.message} role="alert">
            {message}
          </p>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {t(mode === 'login' ? 'auth.login' : 'auth.register', lang)}
            </button>
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t('auth.cancel', lang)}
            </button>
          </div>
        </form>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setMessage(null);
            setErrors({});
          }}
        >
          {t(mode === 'login' ? 'auth.toRegister' : 'auth.toLogin', lang)}
        </button>
        <p className={styles.note}>{t('auth.optional', lang)}</p>
      </div>
    </div>
  );
}

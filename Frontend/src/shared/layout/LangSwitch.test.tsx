import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang, t, useLang } from '../i18n';
import { LangSwitch } from './LangSwitch';

function Probe() {
  const lang = useLang();
  return <p>{t('app.title', lang) + ' ' + t('shell.sources', lang)}</p>;
}

beforeEach(() => {
  localStorage.clear();
  act(() => setLang('ru'));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('LangSwitch', () => {
  it('marks the current language as pressed', () => {
    render(<LangSwitch />);
    expect(screen.getByRole('button', { name: 'Русский' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the language, stores it and re-renders subscribers', () => {
    render(
      <>
        <LangSwitch />
        <Probe />
      </>,
    );
    expect(screen.getByText('LAST LIGHT Источники и допущения')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('LAST LIGHT Sources and assumptions')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
  });
});

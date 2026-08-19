// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { translateAuthError } from '../i18n/auth-error-i18n';
import { LanguageProvider, translateKey } from '../i18n/LanguageContext';
import { SUPPORTED_LOCALES } from '../i18n/locales';
import LoginPage from './LoginPage';

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderLogin() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(LanguageProvider, null, createElement(LoginPage)),
      ),
    );
  });
  return { container, root, cleanup: () => {
    act(() => root.unmount());
    container.remove();
  } };
}

describe('Login canonical localization', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    localStorage.clear();
  });

  it('does not import the removed login-copy shim', () => {
    expect(() => readFileSync(join(__dirname, 'login-copy.ts'), 'utf8')).toThrow();
  });

  it('renders English login copy from canonical keys', () => {
    localStorage.setItem('synqdrive.locale', 'en');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;
    expect(rendered.container.textContent).toContain('Welcome Back!');
    expect(rendered.container.textContent).toContain('Log in');
    expect(rendered.container.textContent).not.toContain('Willkommen zurück!');
  });

  it('renders German login copy from canonical keys', () => {
    localStorage.setItem('synqdrive.locale', 'de');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;
    expect(rendered.container.textContent).toContain('Willkommen zurück!');
    expect(rendered.container.textContent).toContain('Anmelden');
  });

  it('uses explicit English fallback for Turkish login copy', () => {
    const result = translateKey('tr', 'login.welcomeBack');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe('Welcome Back!');
  });

  it('resolves known auth errors to semantic translation keys', () => {
    expect(translateAuthError('de', new Error('Invalid credentials'))).toBe('Ungültige Anmeldedaten.');
    expect(translateAuthError('en', new Error('Invalid credentials'))).toBe('Invalid credentials.');
    expect(translateAuthError('pl', new Error('Account is inactive'))).toBe('This account is inactive.');
  });

  it('keeps all 9 locale options available via shared language selector metadata', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(9);
    localStorage.setItem('synqdrive.locale', 'en');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;
    expect(rendered.container.querySelector('button[aria-expanded]')).toBeTruthy();
  });
});

describe('Login German orthography for P2.1 keys', () => {
  const germanLoginKeys = [
    'login.welcomeBack',
    'login.chooseOrg.subtitle',
    'login.showPassword',
    'login.hidePassword',
    'twoFactor.title',
    'twoFactor.subtitle',
    'auth.error.invalidCredentials',
    'verification.done.title',
    'languageSelector.selectLanguage',
  ] as const;

  it('uses proper German characters in P2.1 login keys', () => {
    for (const key of germanLoginKeys) {
      const text = translateKey('de', key).text;
      expect(text).not.toMatch(/\b(fuer|ueber|naechste|waehlen)\b/i);
      if (key === 'login.welcomeBack') {
        expect(text).toContain('ü');
      }
    }
  });
});

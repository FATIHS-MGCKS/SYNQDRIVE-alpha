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
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '../i18n/locales';
import LoginPage from './LoginPage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginSource = readFileSync(join(__dirname, 'LoginPage.tsx'), 'utf8');

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
  return {
    container,
    root,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
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

  it('does not keep independent locale state in LoginPage', () => {
    expect(loginSource).not.toMatch(/useState<['"]en['"] \| ['"]de['"]>/);
    expect(loginSource).not.toContain('loginCopy');
    expect(loginSource).toContain('useLanguage');
    expect(loginSource).toContain('LanguageSelector variant="login-menu"');
  });

  it('renders English login copy from canonical keys', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;
    expect(rendered.container.textContent).toContain('Welcome Back!');
    expect(rendered.container.textContent).toContain('Log in');
    expect(rendered.container.textContent).not.toContain('Willkommen zurück!');
  });

  it('renders German login copy from canonical keys', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
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

  it('exposes the shared login-menu selector with nine locales', async () => {
    expect(SUPPORTED_LOCALES).toHaveLength(9);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;

    const trigger = rendered.container.querySelector('button[aria-expanded="false"]');
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuButtons = rendered.container.querySelectorAll('[role="menu"] button');
    expect(menuButtons.length).toBe(9);
    expect(rendered.container.textContent).toContain('Türkçe');
  });

  it('persists locale selection through synqdrive.locale only', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const rendered = renderLogin();
    cleanup = rendered.cleanup;

    const trigger = rendered.container.querySelector('button[aria-expanded]');
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const turkishButton = Array.from(rendered.container.querySelectorAll('[role="menu"] button')).find(
      (button) => button.textContent?.includes('Türkçe'),
    );
    expect(turkishButton).toBeTruthy();

    await act(async () => {
      turkishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('tr');
    expect(rendered.container.textContent).toContain('Welcome Back!');
  });
});

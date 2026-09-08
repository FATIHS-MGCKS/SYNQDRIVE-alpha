// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../context/AppThemeContext';
import LoginPage from '../pages/LoginPage';
import { TopBar } from '../rental/components/TopBar';
import { LanguageSelector } from './components/LanguageSelector';
import {
  LanguageProvider,
  useLanguage,
  translateKey,
} from './LanguageContext';
import {
  LanguageProvider as RentalLanguageProvider,
  useLanguage as useRentalLanguage,
} from '../rental/i18n/LanguageContext';
import {
  LOCALE_STORAGE_KEY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  SUPPORTED_LOCALES,
} from './locales';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const loginSource = readFileSync(join(repoRoot, 'src/pages/LoginPage.tsx'), 'utf8');
const topBarSource = readFileSync(join(repoRoot, 'src/rental/components/TopBar.tsx'), 'utf8');
const appSource = readFileSync(join(repoRoot, 'src/App.tsx'), 'utf8');

vi.mock('../rental/FleetContext', () => ({
  useFleetVehicles: () => ({ fleetVehicles: [] }),
}));

vi.mock('../rental/RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-test',
    orgName: 'Test Org',
    availableOrganizations: [],
    switchingOrganization: false,
    switchOrganization: async () => {},
  }),
}));

vi.mock('../operator/components/OperatorEntryButton', () => ({
  OperatorEntryButton: () => null,
}));

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>();
  return {
    ...actual,
    getStoredUser: () => ({
      name: 'Test User',
      email: 'test@example.com',
      platformRole: 'ORG_USER',
      organizationId: 'org-test',
    }),
    clearAuth: vi.fn(),
  };
});

function LocaleProbe({
  onChange,
}: {
  onChange: (value: ReturnType<typeof useLanguage>) => void;
}) {
  const value = useLanguage();
  useEffect(() => {
    onChange(value);
  }, [onChange, value]);
  return null;
}

function renderWithProviders(children: React.ReactNode, initialPath = '/') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        AppThemeProvider,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(MemoryRouter, { initialEntries: [initialPath] }, children),
        ),
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

describe('Integration 2B — canonical Login and TopBar language surfaces', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps Login on the canonical provider without local locale state', () => {
    expect(loginSource).toContain("from '../i18n/LanguageContext'");
    expect(loginSource).not.toMatch(/useState<['"]en['"] \| ['"]de['"]>/);
    expect(loginSource).not.toContain('loginCopy');
    expect(loginSource).toContain('LanguageSelector variant="login-menu"');
  });

  it('keeps TopBar on the shared topbar-pill selector without inline locale registry', () => {
    expect(topBarSource).toContain('LanguageSelector variant="topbar-pill"');
    expect(topBarSource).not.toMatch(/const languages\s*=\s*\[/);
    expect(topBarSource).not.toContain('selectedLanguage');
    expect(topBarSource).not.toContain('isLanguageOpen');
  });

  it('does not introduce duplicate LanguageProvider mounts', () => {
    expect(appSource).toMatch(/<LanguageProvider>\s*\n\s*<BrowserRouter>/);
    expect(appSource.match(/<LanguageProvider>/g)?.length).toBe(1);
  });

  it('renders Login through canonical runtime and reacts to locale changes', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };

    const rendered = renderWithProviders(
      createElement(
        'div',
        null,
        createElement(LoginPage),
        createElement(LocaleProbe, {
          onChange: (value) => {
            platform.current = value;
          },
        }),
      ),
    );
    cleanup = rendered.cleanup;
    expect(rendered.container.textContent).toContain('Willkommen zurück!');

    act(() => platform.current?.setLocale('en'));
    expect(platform.current?.locale).toBe('en');
    expect(rendered.container.textContent).toContain('Welcome Back!');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('renders TopBar with the shared selector and nine locale options', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const rendered = renderWithProviders(createElement(TopBar));
    cleanup = rendered.cleanup;

    const trigger = rendered.container.querySelector('button[aria-expanded]');
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuButtons = rendered.container.querySelectorAll('[role="menu"] button');
    expect(menuButtons.length).toBe(9);
    expect(rendered.container.textContent).toContain('Türkçe');
  });

  it('updates the same canonical locale when TopBar selection changes', async () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

    const rendered = renderWithProviders(
      createElement(
        'div',
        null,
        createElement(TopBar),
        createElement(LocaleProbe, {
          onChange: (value) => {
            platform.current = value;
          },
        }),
        createElement(function RentalProbe() {
          const value = useRentalLanguage();
          useEffect(() => {
            rental.current = value;
          }, [value]);
          return null;
        }),
      ),
    );
    cleanup = rendered.cleanup;

    const trigger = rendered.container.querySelector('button[aria-expanded]');
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const turkishButton = Array.from(rendered.container.querySelectorAll('[role="menu"] button')).find(
      (button) => button.textContent?.includes('Türkçe'),
    );

    await act(async () => {
      turkishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(platform.current?.locale).toBe('tr');
    expect(rental.current?.locale).toBe('tr');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('tr');
  });

  it('preserves locale selected on Login when Rental compatibility consumer mounts', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pl');
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

    const rendered = renderWithProviders(
      createElement(
        'div',
        null,
        createElement(LoginPage),
        createElement(LocaleProbe, {
          onChange: (value) => {
            platform.current = value;
          },
        }),
        createElement(function RentalProbe() {
          const value = useRentalLanguage();
          useEffect(() => {
            rental.current = value;
          }, [value]);
          return null;
        }),
      ),
    );
    cleanup = rendered.cleanup;

    expect(platform.current?.locale).toBe('pl');
    expect(rental.current?.locale).toBe('pl');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl');
  });

  it('writes only synqdrive.locale for locale persistence', () => {
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };
    const rendered = renderWithProviders(
      createElement(function RentalProbe() {
        const value = useRentalLanguage();
        useEffect(() => {
          rental.current = value;
        }, [value]);
        return null;
      }),
    );
    cleanup = rendered.cleanup;

    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      act(() => rental.current?.setLocale(locale));
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale);
      expect(localStorage.getItem('synqdrive.locale')).toBe(locale);
    }
  });

  it('uses canonical English fallback for partial locales without fake dictionary completeness', () => {
    const turkish = translateKey('tr', 'login.welcomeBack');
    expect(turkish.source).toBe('fallback-en');
    expect(turkish.text).toBe('Welcome Back!');

    const german = translateKey('de', 'login.welcomeBack');
    expect(german.source).toBe('locale');
    expect(german.text).toBe('Willkommen zurück!');
  });

  it('keeps all nine official locales selectable through LanguageSelector variants', () => {
    expect(SUPPORTED_LOCALES.map((entry) => entry.code)).toEqual([...OFFICIAL_PRODUCT_LOCALE_CODES]);
    expect(OFFICIAL_PRODUCT_LOCALE_CODES).toContain('tr');

    const loginSelectorSource = readFileSync(join(__dirname, 'components/LanguageSelector.tsx'), 'utf8');
    expect(loginSelectorSource).toContain("variant === 'topbar-pill'");
    expect(loginSelectorSource).toContain('SUPPORTED_LOCALES.map');
    expect(LanguageSelector).toBeTypeOf('function');
  });

  it('keeps Rental compatibility bridge delegating to canonical runtime', () => {
    expect(RentalLanguageProvider).toBe(LanguageProvider);
  });
});

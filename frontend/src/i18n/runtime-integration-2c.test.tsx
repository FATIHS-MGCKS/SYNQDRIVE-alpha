// @vitest-environment happy-dom
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../rental/components/TopBar';
import { AppThemeProvider } from '../context/AppThemeContext';
import {
  LanguageProvider,
  useLanguage,
  translateKey,
} from './LanguageContext';
import {
  LOCALE_STORAGE_KEY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  SUPPORTED_LOCALES,
} from './locales';
import { en } from './translations/en';
import { de } from './translations/de';

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');

const LEGACY_BRIDGE_IMPORT_PATTERNS = [
  /from ['"].*rental\/i18n\//,
  /import\(['"].*rental\/i18n\//,
];

function findLegacyBridgeImports(filePath: string): string[] {
  const rel = relative(srcRoot, filePath).replace(/\\/g, '/');
  const text = readFileSync(filePath, 'utf8');
  const issues: string[] = [];
  for (const pattern of LEGACY_BRIDGE_IMPORT_PATTERNS) {
    if (pattern.test(text)) issues.push(`matches ${pattern}`);
  }
  if (rel.startsWith('rental/') && /from ['"]\.\.\/i18n\//.test(text)) {
    issues.push('rental file still imports deleted rental/i18n shim via ../i18n/');
  }
  return issues;
}

function walkSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walkSourceFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isProductionSource(filePath: string): boolean {
  const rel = relative(srcRoot, filePath).replace(/\\/g, '/');
  if (rel.includes('/__tests__/')) return false;
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
  if (rel === 'i18n/i18n-structural-check.test.ts') return false;
  return true;
}

function RentalProbe({
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

describe('Integration 2C — Rental i18n compatibility bridge retirement', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it('removes the Rental compatibility bridge and legacy dictionary tree', () => {
    expect(existsSync(join(srcRoot, 'rental/i18n/LanguageContext.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'rental/i18n/translations/en.ts'))).toBe(false);
    expect(existsSync(join(srcRoot, 'rental/i18n'))).toBe(false);
  });

  it('has no production imports of the deleted Rental bridge or legacy dictionaries', () => {
    const offenders: string[] = [];
    for (const file of walkSourceFiles(srcRoot)) {
      if (!isProductionSource(file)) continue;
      const rel = relative(srcRoot, file).replace(/\\/g, '/');
      const text = readFileSync(file, 'utf8');
      const issues = findLegacyBridgeImports(file);
      if (issues.length > 0) {
        offenders.push(`${rel}: ${issues.join('; ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports canonical runtime from frontend/src/i18n in representative Rental surfaces', () => {
    const topBar = readFileSync(join(srcRoot, 'rental/components/TopBar.tsx'), 'utf8');
    const sidebar = readFileSync(join(srcRoot, 'rental/components/Sidebar.tsx'), 'utf8');
    expect(topBar).toContain("from '../../i18n/LanguageContext'");
    expect(topBar).toContain("from '../../i18n/components/LanguageSelector'");
    expect(sidebar).toContain("from '../../i18n/LanguageContext'");
    expect(topBar).not.toContain('rental/i18n');
    expect(sidebar).not.toContain('rental/i18n');
  });

  it('keeps exactly one root LanguageProvider in App.tsx', () => {
    const appSource = readFileSync(join(srcRoot, 'App.tsx'), 'utf8');
    const rentalAppSource = readFileSync(join(srcRoot, 'rental/App.tsx'), 'utf8');
    expect(appSource.match(/<LanguageProvider>/g)?.length).toBe(1);
    expect(rentalAppSource).not.toContain('<LanguageProvider>');
  });

  it('propagates locale changes from Rental TopBar to canonical runtime consumers', async () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          AppThemeProvider,
          null,
          createElement(
            LanguageProvider,
            null,
            createElement(
              'div',
              null,
              createElement(TopBar),
              createElement(RentalProbe, {
                onChange: (value) => {
                  platform.current = value;
                },
              }),
              createElement(RentalProbe, {
                onChange: (value) => {
                  rental.current = value;
                },
              }),
            ),
          ),
        ),
      );
    });

    const trigger = container.querySelector('button[aria-expanded]');
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const germanButton = Array.from(container.querySelectorAll('[role="menu"] button')).find((button) =>
      button.textContent?.includes('Deutsch'),
    );

    await act(async () => {
      germanButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(platform.current?.locale).toBe('de');
    expect(rental.current?.locale).toBe('de');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it('persists locale only through synqdrive.locale', () => {
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(RentalProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      act(() => rental.current?.setLocale(locale));
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale);
      expect(Object.keys(localStorage)).toEqual([LOCALE_STORAGE_KEY]);
    }
  });

  it('preserves interpolation and English/German output for representative Rental keys', () => {
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(RentalProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('en'));
    expect(rental.current?.t('nav.communicationCenter')).toBe(en['nav.communicationCenter']);
    expect(rental.current?.t('topbar.welcomeBack', { name: 'Ada' })).toBe('Welcome back, Ada');

    act(() => rental.current?.setLocale('de'));
    expect(rental.current?.t('nav.communicationCenter')).toBe(de['nav.communicationCenter']);
    expect(rental.current?.t('topbar.welcomeBack', { name: 'Ada' })).toBe('Willkommen zurück, Ada');
  });

  it('keeps partial-locale and Turkish fallback policy truthful', () => {
    expect(SUPPORTED_LOCALES.map((entry) => entry.code)).toEqual([...OFFICIAL_PRODUCT_LOCALE_CODES]);

    const french = translateKey('fr', 'common.save');
    expect(french.source).toBe('locale');
    expect(french.text).toBe('Enregistrer');

    const turkish = translateKey('tr', 'nav.communicationCenter');
    expect(turkish.source).toBe('fallback-en');
    expect(turkish.text).toBe(en['nav.communicationCenter']);

    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(RentalProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('tr'));
    expect(rental.current?.t('nav.communicationCenter')).toBe(en['nav.communicationCenter']);
  });
});

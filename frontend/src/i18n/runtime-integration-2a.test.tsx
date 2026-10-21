// @vitest-environment happy-dom
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LanguageProvider,
  useLanguage,
  translateKey,
} from './LanguageContext';
import { LanguageSelector } from './components/LanguageSelector';
import {
  LOCALE_STORAGE_KEY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  readPersistedLocale,
  resolveInitialPlatformLocale,
  SUPPORTED_LOCALES,
} from './locales';
import { en } from './translations/en';
import { de } from './translations/de';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const srcRoot = join(repoRoot, 'src');
const appSource = readFileSync(join(srcRoot, 'App.tsx'), 'utf8');
const rentalAppSource = readFileSync(join(srcRoot, 'rental/App.tsx'), 'utf8');

function walkProductionFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walkProductionFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function PlatformProbe({
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

describe('Integration 2A — canonical runtime provider activation', () => {
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
    vi.unstubAllGlobals();
  });

  it('mounts the canonical LanguageProvider at the application root', () => {
    expect(appSource).toContain("import { LanguageProvider } from './i18n/LanguageContext'");
    expect(appSource).toMatch(/<LanguageProvider>\s*\n\s*<BrowserRouter>/);
    expect(rentalAppSource).not.toContain('<LanguageProvider>');
    expect(rentalAppSource).not.toMatch(/import \{ LanguageProvider \}/);
  });

  it('shares the same active locale between root and nested Rental consumers', () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(
            'div',
            null,
            createElement(PlatformProbe, {
              onChange: (value) => {
                platform.current = value;
              },
            }),
            createElement(PlatformProbe, {
              onChange: (value) => {
                rental.current = value;
              },
            }),
          ),
        ),
      );
    });

    expect(platform.current?.locale).toBe('en');
    expect(rental.current?.locale).toBe('en');

    act(() => platform.current?.setLocale('pl'));
    expect(platform.current?.locale).toBe('pl');
    expect(rental.current?.locale).toBe('pl');
  });

  it('persists locale through the single canonical storage key', () => {
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('cs'));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('cs');
    expect(readPersistedLocale()).toBe('cs');
  });

  it('keeps all nine supported locales selectable through the canonical runtime', () => {
    expect(SUPPORTED_LOCALES.map((entry) => entry.code)).toEqual([...OFFICIAL_PRODUCT_LOCALE_CODES]);
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      act(() => rental.current?.setLocale(locale));
      expect(rental.current?.locale).toBe(locale);
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale);
    }
  });

  it('preserves Italian dictionary-backed translations and Turkish fallback', () => {
    const italian = translateKey('it', 'common.save');
    expect(italian.source).toBe('locale');
    expect(italian.text).toBe('Salva');

    const turkish = translateKey('tr', 'common.save');
    expect(turkish.source).toBe('fallback-en');
    expect(turkish.text.length).toBeGreaterThan(0);

    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('it'));
    expect(rental.current?.t('common.save')).toBe('Salva');

    act(() => rental.current?.setLocale('tr'));
    expect(rental.current?.t('common.save')).toBe(translateKey('tr', 'common.save').text);
  });

  it('falls back safely when persisted locale is invalid', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'invalid-locale');
    expect(readPersistedLocale()).toBeNull();
    vi.stubGlobal('navigator', { languages: ['de-DE'] });
    expect(resolveInitialPlatformLocale(['de-DE'])).toBe('de');

    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    expect(rental.current?.locale).toBe('de');
  });

  it('drives the shared LanguageSelector through canonical runtime state', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LanguageSelector, { variant: 'topbar-pill' }),
        ),
      );
    });

    const trigger = container.querySelector('button[aria-label]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('EN');

    act(() => trigger.click());
    const italianOption = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Italiano'),
    );
    expect(italianOption).toBeTruthy();

    act(() => italianOption?.click());
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('it');
    expect(trigger.textContent).toContain('IT');
  });

  it('resolves migrated Rental keys from the canonical dictionary', () => {
    const rentalOnlyKey = 'nav.communicationCenter';
    expect(translateKey('en', rentalOnlyKey).source).toBe('locale');
    expect(translateKey('en', rentalOnlyKey).text).toBe(en[rentalOnlyKey]);

    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    expect(rental.current?.t(rentalOnlyKey)).toBe('Communication Center');
  });

  it('uses only synqdrive.locale for persistence without alternate locale keys', () => {
    const rental: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlatformProbe, {
            onChange: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('es'));
    const storageKeys = Object.keys(localStorage);
    expect(storageKeys).toEqual([LOCALE_STORAGE_KEY]);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
  });
});

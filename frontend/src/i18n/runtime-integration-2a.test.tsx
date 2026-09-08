// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LanguageProvider,
  useLanguage,
  translateKey,
} from './LanguageContext';
import {
  LanguageProvider as RentalLanguageProvider,
  useLanguage as useRentalLanguage,
} from '../rental/i18n/LanguageContext';
import { LanguageSelector } from './components/LanguageSelector';
import {
  LOCALE_STORAGE_KEY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  readPersistedLocale,
  resolveInitialPlatformLocale,
  SUPPORTED_LOCALES,
} from './locales';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const appSource = readFileSync(join(repoRoot, 'src/App.tsx'), 'utf8');
const rentalAppSource = readFileSync(join(repoRoot, 'src/rental/App.tsx'), 'utf8');
const rentalShimSource = readFileSync(join(repoRoot, 'src/rental/i18n/LanguageContext.tsx'), 'utf8');

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

function RentalProbe({
  onChange,
}: {
  onChange: (value: ReturnType<typeof useRentalLanguage>) => void;
}) {
  const value = useRentalLanguage();
  useEffect(() => {
    onChange(value);
  }, [onChange, value]);
  return null;
}

function NavigationShell({
  onPlatform,
  onRental,
}: {
  onPlatform: (value: ReturnType<typeof useLanguage>) => void;
  onRental: (value: ReturnType<typeof useRentalLanguage>) => void;
}) {
  const [surface, setSurface] = useState<'rental' | 'operator'>('rental');
  return (
    <div>
      <button type="button" data-testid="goto-operator" onClick={() => setSurface('operator')}>
        operator
      </button>
      <button type="button" data-testid="goto-rental" onClick={() => setSurface('rental')}>
        rental
      </button>
      {surface === 'rental' ? (
        <div data-testid="rental-surface">
          <PlatformProbe onChange={onPlatform} />
          <RentalProbe onChange={onRental} />
        </div>
      ) : (
        <div data-testid="operator-surface">
          <PlatformProbe onChange={onPlatform} />
          <RentalProbe onChange={onRental} />
        </div>
      )}
    </div>
  );
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

  it('keeps the Rental module as a compatibility re-export without independent context state', () => {
    expect(rentalShimSource).toContain("from '../../i18n/LanguageContext'");
    expect(rentalShimSource).not.toContain('createContext');
    expect(rentalShimSource).not.toContain('useState');
    expect(RentalLanguageProvider).toBe(LanguageProvider);
  });

  it('shares the same active locale between canonical and Rental compatibility consumers', () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(NavigationShell, {
            onPlatform: (value) => {
              platform.current = value;
            },
            onRental: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    expect(platform.current?.locale).toBe('en');
    expect(rental.current?.locale).toBe('en');

    act(() => platform.current?.setLocale('pl'));
    expect(platform.current?.locale).toBe('pl');
    expect(rental.current?.locale).toBe('pl');
  });

  it('propagates locale changes initiated through the Rental compatibility API', () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(NavigationShell, {
            onPlatform: (value) => {
              platform.current = value;
            },
            onRental: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('fr'));
    expect(rental.current?.locale).toBe('fr');
    expect(platform.current?.locale).toBe('fr');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });

  it('persists locale through the single canonical storage key', () => {
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

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

    act(() => rental.current?.setLocale('cs'));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('cs');
    expect(readPersistedLocale()).toBe('cs');
  });

  it('keeps all nine supported locales selectable through the canonical runtime', () => {
    expect(SUPPORTED_LOCALES.map((entry) => entry.code)).toEqual([...OFFICIAL_PRODUCT_LOCALE_CODES]);
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

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
      expect(rental.current?.locale).toBe(locale);
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale);
    }
  });

  it('preserves Italian dictionary-backed translations and Turkish fallback through the bridge', () => {
    const italian = translateKey('it', 'common.save');
    expect(italian.source).toBe('locale');
    expect(italian.text).toBe('Salva');

    const turkish = translateKey('tr', 'common.save');
    expect(turkish.source).toBe('fallback-en');
    expect(turkish.text.length).toBeGreaterThan(0);

    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };
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

    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };
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

    expect(rental.current?.locale).toBe('de');
  });

  it('does not reset locale when representative module navigation remounts child surfaces', () => {
    const platform: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const rental: { current: ReturnType<typeof useRentalLanguage> | null } = { current: null };

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(NavigationShell, {
            onPlatform: (value) => {
              platform.current = value;
            },
            onRental: (value) => {
              rental.current = value;
            },
          }),
        ),
      );
    });

    act(() => rental.current?.setLocale('nl'));
    expect(platform.current?.locale).toBe('nl');

    const operatorButton = container.querySelector('[data-testid="goto-operator"]') as HTMLButtonElement;
    const rentalButton = container.querySelector('[data-testid="goto-rental"]') as HTMLButtonElement;

    act(() => operatorButton.click());
    expect(container.querySelector('[data-testid="operator-surface"]')).not.toBeNull();
    expect(platform.current?.locale).toBe('nl');
    expect(rental.current?.locale).toBe('nl');

    act(() => rentalButton.click());
    expect(container.querySelector('[data-testid="rental-surface"]')).not.toBeNull();
    expect(platform.current?.locale).toBe('nl');
    expect(rental.current?.locale).toBe('nl');
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
});

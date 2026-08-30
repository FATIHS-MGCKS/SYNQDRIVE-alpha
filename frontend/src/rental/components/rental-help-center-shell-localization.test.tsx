// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import { HelpCenterView } from './HelpCenterView';

const P265_ENFORCE_CLEAN_EXACT = ['rental/components/HelpCenterView.tsx'];

const SEARCH_FIXTURE = 'Provider Search Query X7';
const SEARCH_MATCH_QUERY = 'Buchungen';
const STATIC_SECTION_TITLE = 'Erste Schritte';
const STATIC_ARTICLE_TITLE = 'Was ist SynqDrive?';

let mountCount = 0;
let supportClicks = 0;

function LocaleHarness({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mountCount += 1;
    }
  }, []);
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-de', onClick: () => setLocale('de') },
      'DE',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-en', onClick: () => setLocale('en') },
      'EN',
    ),
    createElement('div', { 'data-testid': `active-locale-${locale}` }, children),
  );
}

function countSectionsAndArticles(source: string) {
  const match = source.match(/const SECTIONS: HelpSection\[\] = \[([\s\S]*?)\];\n\n\/\/ ═/);
  const block = match![1];
  const topLevelSectionIds = [...block.matchAll(/\n  \{\n    id: '([^']+)'/g)].map((m) => m[1]);
  const articleIds = [...block.matchAll(/\n      \{\n        id: '([^']+)'/g)].map((m) => m[1]);
  return { sectionCount: topLevelSectionIds.length, articleCount: articleIds.length, sectionIds: topLevelSectionIds, articleIds };
}

async function setSearchInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function ensureLocale(container: HTMLElement, locale: 'de' | 'en') {
  const active = container.querySelector(`[data-testid="active-locale-${locale}"]`);
  if (!active) {
    await act(async () => {
      (container.querySelector(`[data-testid="locale-${locale}"]`) as HTMLButtonElement).click();
    });
  }
}

beforeEach(() => {
  mountCount = 0;
  supportClicks = 0;
  localStorage.clear();
  writePersistedLocale('de');
});

describe('rental Help Center shell chrome localization (P2.2.65)', () => {
  it('keeps P265 enforce-clean scope at zero inventory findings', () => {
    const debt = inventory.findings.filter((f) => P265_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(debt).toHaveLength(0);
  });

  it('localizes shell copy in DE and EN while preserving static SECTIONS content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(HelpCenterView, {
              isDarkMode: false,
              onOpenSupport: () => {
                supportClicks += 1;
              },
            }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');

    expect(container.textContent).toContain(de['nav.helpCenter']);
    expect(container.textContent).toContain(de['helpCenter.intro']);
    expect(container.textContent).toContain(STATIC_SECTION_TITLE);
    expect(container.textContent).toContain(STATIC_ARTICLE_TITLE);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(en['nav.helpCenter']);
    expect(container.textContent).toContain(en['helpCenter.intro']);
    expect(container.textContent).toContain(STATIC_SECTION_TITLE);
    expect(container.textContent).toContain(STATIC_ARTICLE_TITLE);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('preserves same-mount state, search query, and zero business refetch across DE → EN → DE', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(HelpCenterView, {
              isDarkMode: true,
              onOpenSupport: () => {
                supportClicks += 1;
              },
            }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');
    const mountsAfterRender = mountCount;

    const searchInput = container.querySelector('[data-testid="help-center-search"]') as HTMLInputElement;
    await setSearchInputValue(searchInput, SEARCH_FIXTURE);

    expect(searchInput.value).toBe(SEARCH_FIXTURE);
    expect(container.textContent).toContain(de['helpCenter.noResults']);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(mountCount).toBe(mountsAfterRender);
    expect(searchInput.value).toBe(SEARCH_FIXTURE);
    expect(container.textContent).toContain(en['helpCenter.noResults']);
    expect(container.textContent).not.toContain(STATIC_SECTION_TITLE);

    const supportButton = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes(en['helpCenter.supportCta']),
    ) as HTMLButtonElement;
    await act(async () => {
      supportButton.click();
    });
    expect(supportClicks).toBe(1);

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });

    expect(searchInput.value).toBe(SEARCH_FIXTURE);
    expect(container.textContent).toContain(de['helpCenter.noResults']);
    expect(supportClicks).toBe(1);

    await setSearchInputValue(searchInput, '');
    expect(container.textContent).toContain(STATIC_SECTION_TITLE);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps search parity and navigation identity across locales', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(HelpCenterView, { isDarkMode: false }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');
    const searchInput = container.querySelector('[data-testid="help-center-search"]') as HTMLInputElement;
    await setSearchInputValue(searchInput, SEARCH_MATCH_QUERY);

    const deStatus = container.querySelector('[data-testid="help-center-search-status"]')?.textContent ?? '';
    const deHasBookingsSection = container.textContent?.includes('Buchungen');

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    const enStatus = container.querySelector('[data-testid="help-center-search-status"]')?.textContent ?? '';
    expect(searchInput.value).toBe(SEARCH_MATCH_QUERY);
    expect(deHasBookingsSection).toBe(true);
    expect(container.textContent).toContain('Buchungen');
    expect(deStatus).toMatch(/\d/);
    expect(enStatus).toMatch(/\d/);
    expect(deStatus.replace(/\D/g, '')).toBe(enStatus.replace(/\D/g, ''));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('freezes SECTIONS static content corpus (shell-only slice)', () => {
    const source = readFileSync(resolve(__dirname, './HelpCenterView.tsx'), 'utf8');
    const snapshot = countSectionsAndArticles(source);

    expect(snapshot.sectionCount).toBe(17);
    expect(snapshot.articleCount).toBe(44);
    expect(snapshot.sectionIds).toContain('getting-started');
    expect(snapshot.sectionIds).toContain('faq');
    expect(snapshot.articleIds).toContain('welcome');
    expect(source).toContain("title: 'Erste Schritte'");
    expect(source).toContain("title: 'Was ist SynqDrive?'");
    expect(source).not.toContain('helpCenter.sections.');
  });

  it('documents no adapter and no business fetch surface', () => {
    const source = readFileSync(resolve(__dirname, './HelpCenterView.tsx'), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bapi\./);
    expect(source).not.toContain('rental-help-center-i18n');
  });
});

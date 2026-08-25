// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSetActiveTab = vi.fn();

let mockActiveTab = 'today';

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    activeTab: mockActiveTab,
    setActiveTab: (tab: string) => {
      mockSetActiveTab(tab);
      mockActiveTab = tab;
    },
  }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { OPERATOR_TABS, type OperatorTab } from '../lib/operatorTypes';
import {
  operatorShellNavigationAriaLabel,
  operatorShellNavigationTabLabel,
} from '../lib/operator-shell-navigation-i18n';
import { OperatorBottomNav } from './OperatorBottomNav';

const P243_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBottomNav.tsx',
  'operator/lib/operator-shell-navigation-i18n.ts',
];

const TAB_ORDER: OperatorTab[] = [...OPERATOR_TABS];

function isP243EnforceCleanPath(relPath: string): boolean {
  return P243_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p243ScopedFindings() {
  return inventory.findings.filter((finding) => isP243EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function LocaleSwitchHarness() {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorBottomNav),
  );
}

function tabButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('nav button'));
}

function tabLabel(container: HTMLElement, tab: OperatorTab, locale: 'de' | 'en') {
  return operatorShellNavigationTabLabel(locale, tab);
}

describe('operator shell navigation localization (P2.2.43)', () => {
  afterEach(() => {
    mockActiveTab = 'today';
    vi.clearAllMocks();
  });

  it('has zero P243 enforce-clean scanner debt', () => {
    expect(p243ScopedFindings()).toHaveLength(0);
  });

  it('renders German tab labels and aria label', () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorBottomNav));

    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      operatorShellNavigationAriaLabel('de'),
    );
    for (const tab of TAB_ORDER) {
      expect(container.textContent).toContain(tabLabel(container, tab, 'de'));
    }

    cleanup();
  });

  it('renders English tab labels and aria label', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorBottomNav));

    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      operatorShellNavigationAriaLabel('en'),
    );
    for (const tab of TAB_ORDER) {
      expect(container.textContent).toContain(tabLabel(container, tab, 'en'));
    }

    cleanup();
  });

  it('preserves tab order across locales', () => {
    const { container: deContainer, cleanup: cleanupDe } = renderWithLocale(
      'de',
      createElement(OperatorBottomNav),
    );
    const deButtons = tabButtons(deContainer);
    cleanupDe();

    const { container: enContainer, cleanup: cleanupEn } = renderWithLocale(
      'en',
      createElement(OperatorBottomNav),
    );
    const enButtons = tabButtons(enContainer);

    expect(deButtons).toHaveLength(TAB_ORDER.length);
    expect(enButtons).toHaveLength(TAB_ORDER.length);

    for (let index = 0; index < TAB_ORDER.length; index += 1) {
      expect(deButtons[index]?.textContent).toContain(tabLabel(deContainer, TAB_ORDER[index], 'de'));
      expect(enButtons[index]?.textContent).toContain(tabLabel(enContainer, TAB_ORDER[index], 'en'));
    }

    cleanupEn();
  });

  it('preserves React keys and active tab across same-mount locale switch', async () => {
    mockActiveTab = 'scan';
    const { container, cleanup } = renderWithLocale('de', createElement(LocaleSwitchHarness));

    const buttonsBefore = tabButtons(container);
    expect(buttonsBefore[1]?.getAttribute('data-active')).toBe('true');

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(tabLabel(container, 'scan', 'en'));
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      operatorShellNavigationAriaLabel('en'),
    );

    const buttonsAfter = tabButtons(container);
    expect(buttonsAfter).toHaveLength(TAB_ORDER.length);
    expect(buttonsAfter[1]?.getAttribute('data-active')).toBe('true');

    cleanup();
  });

  it('passes machine tab IDs to setActiveTab in German', () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorBottomNav));

    for (const [index, tab] of TAB_ORDER.entries()) {
      const button = tabButtons(container)[index];
      act(() => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(mockSetActiveTab).toHaveBeenLastCalledWith(tab);
    }

    cleanup();
  });

  it('passes machine tab IDs to setActiveTab in English', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorBottomNav));

    for (const [index, tab] of TAB_ORDER.entries()) {
      const button = tabButtons(container)[index];
      act(() => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(mockSetActiveTab).toHaveBeenLastCalledWith(tab);
    }

    cleanup();
  });

  it('does not render raw machine tab IDs as visible labels', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorBottomNav));
    const text = container.textContent ?? '';

    for (const tab of TAB_ORDER) {
      expect(text).not.toMatch(new RegExp(`\\b${tab}\\b`));
    }

    cleanup();
  });

  it('does not render raw translation keys', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorBottomNav));
    const text = container.textContent ?? '';

    expect(text).not.toContain('operator.navigation.');
    expect(text).not.toContain('common.today');
    expect(text).not.toContain('nav.tasks');

    cleanup();
  });
});

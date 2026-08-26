// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORG_NAME = 'F.S Mobility Services';
const mockTriggerRefresh = vi.fn();

let mockSyncState = {
  loading: false,
  lastSyncAt: null as string | null,
  error: false,
};
let mockOrgLoading = false;
let mockOnline = true;

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({
    orgName: ORG_NAME,
    loading: mockOrgLoading,
  }),
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    syncState: mockSyncState,
    triggerRefresh: mockTriggerRefresh,
  }),
}));

vi.mock('../hooks/useOperatorNetworkStatus', () => ({
  useOperatorNetworkStatus: () => ({ online: mockOnline }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { OperatorConnectivityBanner } from './OperatorConnectivityBanner';
import { OperatorHeader } from './OperatorHeader';
import {
  operatorShellConnectivityOfflineMessage,
  operatorShellHeaderAppLinkLabel,
  operatorShellHeaderAriaLabel,
  operatorShellHeaderEyebrow,
  operatorShellHeaderOrgLoadingLabel,
  operatorShellHeaderRefreshTitle,
  operatorShellHeaderSyncLabel,
} from '../lib/operator-shell-top-chrome-i18n';

const P244_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorHeader.tsx',
  'operator/components/OperatorConnectivityBanner.tsx',
  'operator/lib/operator-shell-top-chrome-i18n.ts',
];

function isP244EnforceCleanPath(relPath: string): boolean {
  return P244_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p244ScopedFindings() {
  return inventory.findings.filter((finding) => isP244EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(
      createElement(MemoryRouter, null, createElement(LanguageProvider, null, ui)),
    );
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function LocaleSwitchHarness({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    children,
  );
}

describe('operator shell top chrome localization (P2.2.44)', () => {
  afterEach(() => {
    mockSyncState = { loading: false, lastSyncAt: null, error: false };
    mockOrgLoading = false;
    mockOnline = true;
    vi.clearAllMocks();
  });

  it('has zero P244 enforce-clean scanner debt', () => {
    expect(p244ScopedFindings()).toHaveLength(0);
  });

  it('renders German header chrome and preserves organization name', () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorHeader));

    expect(container.textContent).toContain(operatorShellHeaderEyebrow('de'));
    expect(container.textContent).toContain(ORG_NAME);
    expect(container.querySelector('header')?.getAttribute('aria-label')).toMatch(/Deutsch/);
    expect(container.querySelector('button')?.getAttribute('title')).toBe(
      operatorShellHeaderRefreshTitle('de'),
    );
    expect(container.querySelector('a[href="/rental"]')?.textContent).toBe(
      operatorShellHeaderAppLinkLabel('de'),
    );

    cleanup();
  });

  it('renders English header chrome and preserves organization name', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorHeader));

    expect(container.textContent).toContain(operatorShellHeaderEyebrow('en'));
    expect(container.textContent).toContain(ORG_NAME);
    expect(container.querySelector('header')?.getAttribute('aria-label')).toMatch(/English/);
    expect(container.querySelector('button')?.getAttribute('title')).toBe(
      operatorShellHeaderRefreshTitle('en'),
    );

    cleanup();
  });

  it('preserves header sync labels across sync machine states in EN and DE', () => {
    mockSyncState = { loading: true, lastSyncAt: null, error: false };
    const { container: deLoading, cleanup: cleanupDe } = renderWithLocale(
      'de',
      createElement(OperatorHeader),
    );
    expect(deLoading.textContent).toContain(
      operatorShellHeaderSyncLabel('de', mockSyncState, 'de-DE'),
    );
    cleanupDe();

    mockSyncState = { loading: false, lastSyncAt: null, error: true };
    const { container: enError, cleanup: cleanupEn } = renderWithLocale(
      'en',
      createElement(OperatorHeader),
    );
    expect(enError.textContent).toContain(
      operatorShellHeaderSyncLabel('en', mockSyncState, 'en-US'),
    );
    cleanupEn();
  });

  it('preserves organization loading label and refresh callback across locale switch', async () => {
    mockOrgLoading = true;
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, { children: createElement(OperatorHeader) }),
    );

    expect(container.textContent).toContain(operatorShellHeaderOrgLoadingLabel('de'));

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(operatorShellHeaderOrgLoadingLabel('en'));

    const refreshButton = container.querySelectorAll('button')[1];
    act(() => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockTriggerRefresh).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('preserves App link route across locales', () => {
    const { container: deContainer, cleanup: cleanupDe } = renderWithLocale(
      'de',
      createElement(OperatorHeader),
    );
    expect(deContainer.querySelector('a[href="/rental"]')?.getAttribute('href')).toBe('/rental');
    cleanupDe();

    const { container: enContainer, cleanup: cleanupEn } = renderWithLocale(
      'en',
      createElement(OperatorHeader),
    );
    expect(enContainer.querySelector('a[href="/rental"]')?.getAttribute('href')).toBe('/rental');
    cleanupEn();
  });

  it('renders nothing for connectivity banner when online', () => {
    mockOnline = true;
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorConnectivityBanner),
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    cleanup();
  });

  it('renders German offline connectivity banner', () => {
    mockOnline = false;
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorConnectivityBanner),
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      operatorShellConnectivityOfflineMessage('de'),
    );

    cleanup();
  });

  it('renders English offline connectivity banner', () => {
    mockOnline = false;
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorConnectivityBanner),
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      operatorShellConnectivityOfflineMessage('en'),
    );

    cleanup();
  });

  it('preserves offline banner visibility across same-mount locale switch', async () => {
    mockOnline = false;
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, {
        children: createElement(OperatorConnectivityBanner),
      }),
    );

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).toContain(operatorShellConnectivityOfflineMessage('de'));

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).toContain(operatorShellConnectivityOfflineMessage('en'));

    cleanup();
  });

  it('does not render raw translation keys', () => {
    mockOnline = false;
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(
        'div',
        null,
        createElement(OperatorHeader),
        createElement(OperatorConnectivityBanner),
      ),
    );
    const text = container.textContent ?? '';

    expect(text).not.toContain('operator.header.');
    expect(text).not.toContain('operator.connectivity.');
    expect(text).not.toContain('common.loading');

    cleanup();
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  evaluateOperatorAccess,
  isRentalBusinessType,
} from '../lib/operatorAccess';
import {
  operatorEntryAccessBackToAppLabel,
  operatorEntryAccessButtonLabel,
  operatorEntryAccessDenialMessage,
  operatorEntryAccessDenialTitle,
  operatorEntryAccessLinkCopyLabel,
  operatorEntryAccessLoginCta,
  operatorEntryAccessNoticeHeading,
} from '../lib/operator-entry-access-i18n';
import { OperatorAccessDeniedScreen } from '../components/OperatorAccessDeniedScreen';
import { OperatorDesktopOnlyNotice } from '../components/OperatorDesktopOnlyNotice';
import { OperatorEntryButton } from '../components/OperatorEntryButton';
import { OperatorLinkCard } from '../components/OperatorLinkCard';

const P248_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorEntryModal.tsx',
  'operator/components/OperatorDesktopOnlyNotice.tsx',
  'operator/components/OperatorAccessDeniedScreen.tsx',
  'operator/components/OperatorAccessGuard.tsx',
  'operator/components/OperatorEntryButton.tsx',
  'operator/components/OperatorLinkCard.tsx',
  'operator/lib/operatorAccess.ts',
  'operator/components/OperatorAccessLoadingScreen.tsx',
  'operator/lib/operator-entry-access-i18n.ts',
];

vi.mock('../../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...actual,
    isAuthenticated: vi.fn(() => true),
    isMasterAdmin: vi.fn(() => false),
    getStoredUser: vi.fn(() => ({
      id: 'user-1',
      email: 'operator@example.test',
      name: 'Field Operator',
      membershipRole: 'WORKER',
      organizationId: 'org-1',
    })),
  };
});

vi.mock('../hooks/useIsOperatorDevice', () => ({
  useIsOperatorDevice: () => false,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.stubGlobal('navigator', {
  ...navigator,
  clipboard: {
    writeText: vi.fn(async () => undefined),
  },
});

function isP248EnforceCleanPath(relPath: string): boolean {
  return P248_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p248ScopedFindings() {
  return inventory.findings.filter((finding) => isP248EnforceCleanPath(finding.file));
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

describe('operator entry & access shell localization (P2.2.48)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('has zero P248 enforce-clean scanner debt', () => {
    expect(p248ScopedFindings()).toHaveLength(0);
  });

  it('renders German desktop-only notice chrome', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorDesktopOnlyNotice),
    );

    expect(container.textContent).toContain(operatorEntryAccessNoticeHeading('de'));
    expect(container.textContent).toContain(operatorEntryAccessBackToAppLabel('de'));
    expect(container.textContent).toContain('/operator');
    expect(container.textContent).not.toContain('operator.entry.access.');

    cleanup();
  });

  it('renders English entry button chrome', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorEntryButton));

    expect(container.textContent).toContain(operatorEntryAccessButtonLabel('en'));
    expect(container.querySelector('button[title]')?.getAttribute('title')).toBeTruthy();

    cleanup();
  });

  it('maps denial machine reasons to localized presentation without leaking raw IDs', () => {
    expect(operatorEntryAccessDenialTitle('de', 'no_organization')).toBe(
      operatorEntryAccessDenialMessage('de', 'no_organization').title,
    );
    expect(operatorEntryAccessDenialTitle('en', 'forbidden_role')).not.toContain('forbidden_role');
  });

  it('preserves denial reason and CTA semantics across locale switch', async () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, {
        children: createElement(OperatorAccessDeniedScreen, { reason: 'unauthenticated' }),
      }),
    );

    expect(container.textContent).toContain(operatorEntryAccessLoginCta('de'));
    expect(container.querySelector('a[href="/login"]')).toBeTruthy();

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(operatorEntryAccessLoginCta('en'));
    expect(container.querySelector('a[href="/login"]')).toBeTruthy();
    expect(container.textContent).not.toContain('unauthenticated');

    cleanup();
  });

  it('preserves auth/access evaluation semantics independent of locale', () => {
    expect(evaluateOperatorAccess(null)).toEqual({ allowed: false, reason: 'unauthenticated' });
    expect(isRentalBusinessType('RENTAL')).toBe(true);
    expect(isRentalBusinessType('fleet')).toBe(false);
  });

  it('localizes link card chrome and keeps dynamic URL raw', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorLinkCard));

    expect(container.textContent).toContain('http');
    expect(container.textContent).toContain('/operator');
    expect(container.textContent).toContain(operatorEntryAccessLinkCopyLabel('en'));
    expect(container.textContent).not.toContain('operator.entry.access.');

    cleanup();
  });
});

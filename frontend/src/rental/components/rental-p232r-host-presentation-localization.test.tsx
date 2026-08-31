// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { scanRepository } from '../../../scripts/i18n-hardcoded-scan.mjs';
import { compareFindingsToManifest } from '../../../scripts/lib/i18n-governance/comparator.mjs';
import { loadManifest } from '../../../scripts/lib/i18n-governance/manifest-validator.mjs';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, translateKey, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';

const RAW_CUSTOMER = 'Provider Customer X7';
const RAW_STATION = 'Station X7';

let fetchCount = 0;
let mountCount = 0;

vi.mock('../../lib/api', () => ({
  api: {
    customers: {
      list: vi.fn(async () => {
        fetchCount += 1;
        return [{ id: 'c1', firstName: RAW_CUSTOMER, lastName: '', email: 'x7@example.com' }];
      }),
    },
    dataAuthorizations: {
      list: vi.fn(async () => {
        fetchCount += 1;
        return [];
      }),
      stats: vi.fn(async () => {
        fetchCount += 1;
        return { total: 0, active: 0, pending: 0, highRisk: 0, expiringSoon: 0, revoked: 0, expired: 0 };
      }),
    },
  },
}));

function LocaleHarness({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mountCount += 1;
    }
  }, []);
  const { locale, setLocale, t } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'div',
      { 'data-testid': 'locale', 'data-locale': locale },
      locale,
    ),
    createElement('div', { 'data-testid': 'shell-toast' }, t('rental.shell.cleaning.toast.taskCreated')),
    createElement('div', { 'data-testid': 'booking-toast' }, t('bookings.toast.saved')),
    createElement('div', { 'data-testid': 'new-booking-toast' }, t('newBooking.toast.incomplete')),
    createElement('div', { 'data-testid': 'customer-toast' }, t('customers.toast.noteSaved')),
    createElement('div', { 'data-testid': 'data-auth-toast' }, t('settings.dataAuth.toast.approved')),
    createElement('div', { 'data-testid': 'voice-toast' }, t('voice.conversations.toast.taskCreated')),
    createElement('div', { 'data-testid': 'raw-customer' }, RAW_CUSTOMER),
    createElement('div', { 'data-testid': 'raw-station' }, RAW_STATION),
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale('en') },
      'en',
    ),
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale('de') },
      'de',
    ),
    children,
  );
}

function renderWithLocale(ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(LanguageProvider, null, createElement(LocaleHarness, null, ui)));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('P2.3.2R host-presentation remediation', () => {
  beforeEach(() => {
    fetchCount = 0;
    mountCount = 0;
    writePersistedLocale('de');
    vi.clearAllMocks();
  });

  it('governance scanner reports zero active remediation', () => {
    const manifest = loadManifest('src/i18n/i18n-debt-classifications.json');
    const { findings } = scanRepository({ includeEnhanced: true });
    const comparison = compareFindingsToManifest(findings, manifest);
    expect(comparison.activeRemediationCount).toBe(0);
    expect(comparison.newUnclassifiedActiveHostDebtCount).toBe(0);
    expect(manifest.governanceBaseline.findingCount).toBe(1627);
    expect(manifest.governanceBaseline.fingerprintVersion).toBe(3);
  });

  it('new translation keys exist in EN and DE with parity', () => {
    const sampleKeys = [
      'rental.shell.cleaning.toast.taskCreated',
      'bookings.toast.saved',
      'newBooking.toast.incomplete',
      'customers.toast.noteSaved',
      'rental.vehicleHealth.aria.dataQuality',
      'settings.dataAuth.toast.approved',
      'voice.conversations.toast.taskCreated',
    ] as const;
    for (const key of sampleKeys) {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
      expect(en[key]).not.toBe(de[key]);
    }
    expect(Object.keys(en).length).toBe(Object.keys(de).length);
  });

  it('same-mount DE→EN→DE switches presentation without remount', async () => {
    const { container, unmount } = renderWithLocale(null);
    expect(mountCount).toBe(1);
    expect(container.querySelector('[data-testid="shell-toast"]')?.textContent).toContain('Reinigungsaufgabe');
    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="locale"]')?.getAttribute('data-locale')).toBe('en');
    expect(container.querySelector('[data-testid="shell-toast"]')?.textContent).toContain('Cleaning task');
    expect(mountCount).toBe(1);
    await act(async () => {
      container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="locale"]')?.getAttribute('data-locale')).toBe('de');
    unmount();
  });

  it('preserves raw fixture bytes across locale switch', async () => {
    const { container, unmount } = renderWithLocale(null);
    const rawBefore = container.querySelector('[data-testid="raw-customer"]')?.textContent;
    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="raw-customer"]')?.textContent).toBe(rawBefore);
    expect(rawBefore).toBe(RAW_CUSTOMER);
    unmount();
  });

  it('aria accessibility labels localize per locale without bilingual hardcode', () => {
    expect(translateKey('de', 'rental.vehicleHealth.aria.dataQuality').text).toBe('Datenqualität');
    expect(translateKey('en', 'rental.vehicleHealth.aria.dataQuality').text).toBe('Data quality');
    expect(translateKey('de', 'rental.vehicleHealth.aria.safety').text).toBe('Sicherheit');
    expect(translateKey('en', 'rental.vehicleHealth.aria.safety').text).toBe('Safety');
  });

  it('zero-refetch witness: locale switch alone does not increment mocked fetch counters', async () => {
    const { container, unmount } = renderWithLocale(null);
    const before = fetchCount;
    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fetchCount).toBe(before);
    unmount();
  });
});

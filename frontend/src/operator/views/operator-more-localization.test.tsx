// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const VEHICLE_LABEL = 'Tesla Model 3 · KS-OP-42';
const mockOpenSheet = vi.fn();
const mockSetActiveTab = vi.fn();
const mockSetScanQuery = vi.fn();

vi.mock('../../context/AppThemeContext', () => ({
  useAppTheme: () => ({
    preference: 'system' as const,
    cycleThemePreference: vi.fn(),
  }),
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    openSheet: mockOpenSheet,
    setActiveTab: mockSetActiveTab,
    setScanQuery: mockSetScanQuery,
  }),
}));

vi.mock('../hooks/useOperatorVehiclesData', () => ({
  useOperatorVehiclesData: () => ({
    allVehicles: [
      { id: 'veh-1', model: 'Tesla Model 3', license: 'KS-OP-42' },
      { id: 'veh-2', model: 'VW Golf', license: 'KS-OP-99' },
    ],
  }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { OperatorMoreView } from './OperatorMoreView';
import {
  operatorMoreCreateBookingTitle,
  operatorMoreThemePreferenceLabel,
  operatorMoreWebAppLinkLabel,
} from '../lib/operator-more-i18n';

const P239_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorMoreView.tsx',
  'operator/lib/operator-more-i18n.ts',
];

function isP239EnforceCleanPath(relPath: string): boolean {
  return P239_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p239ScopedFindings() {
  return inventory.findings.filter((finding) => isP239EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(MemoryRouter, null, createElement(LanguageProvider, null, ui)));
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
    createElement(OperatorMoreView),
  );
}

describe('operator more view localization (P2.2.39)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('has zero P239 enforce-clean scanner debt', () => {
    expect(p239ScopedFindings()).toHaveLength(0);
  });

  it('renders German section and action labels', () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorMoreView));

    expect(container.textContent).toContain('Aktionen');
    expect(container.textContent).toContain('Buchung aufnehmen');
    expect(container.textContent).toContain('Neue Mietbuchung anlegen');
    expect(container.textContent).toContain('Zur Web-App');

    cleanup();
  });

  it('renders English section and action labels', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorMoreView));

    expect(container.textContent).toContain('Actions');
    expect(container.textContent).toContain('Create booking');
    expect(container.textContent).toContain('Create a new rental booking');
    expect(container.textContent).toContain('Open web app');

    cleanup();
  });

  it('preserves vehicle labels across same-mount locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(LanguageProvider, null, createElement(LocaleSwitchHarness)),
        ),
      );
    });

    expect(container.textContent).toContain('Aktionen');

    const tireButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Reifenprofil messen'),
    );
    expect(tireButton).toBeTruthy();
    await act(async () => {
      tireButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(VEHICLE_LABEL);
    expect(container.textContent).toContain('VW Golf · KS-OP-99');

    const toggle = container.querySelector('button');
    expect(toggle?.textContent).toBe('toggle-locale');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Actions');
      expect(container.textContent).toContain(VEHICLE_LABEL);
      expect(container.textContent).toContain('VW Golf · KS-OP-99');
    });

    act(() => root.unmount());
    container.remove();
  });

  it('opens booking-create sheet with unchanged callback args', async () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorMoreView));

    const createButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Create booking'),
    );
    expect(createButton).toBeTruthy();
    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockOpenSheet).toHaveBeenCalledWith({ type: 'booking-create' });

    cleanup();
  });

  it('maps theme preference machine values to localized labels', () => {
    expect(operatorMoreThemePreferenceLabel('de', 'light')).toBe('Design: Hell');
    expect(operatorMoreThemePreferenceLabel('en', 'dark')).toBe('Theme: Dark');
  });

  it('reuses operator.bookings.form.createTitle for create booking action', () => {
    expect(operatorMoreCreateBookingTitle('en')).toBe('Create booking');
    expect(operatorMoreCreateBookingTitle('de')).toBe('Buchung aufnehmen');
  });

  it('keeps web app link target unchanged', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorMoreView));
    const link = container.querySelector('a[href="/rental"]');
    expect(link).toBeTruthy();
    expect(operatorMoreWebAppLinkLabel('en')).toBe('Open web app');
    cleanup();
  });
});

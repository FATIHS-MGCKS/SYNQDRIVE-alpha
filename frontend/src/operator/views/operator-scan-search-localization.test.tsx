// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const QUERY_FIXTURE = 'KS-FS-1234 Max Mustermann';
const NO_MATCH_QUERY = 'ZZ-NO-MATCH-999';
const BOOKING_ID = 'bk-p242-scan-42abcdef';
const VEHICLE_NAME = 'Audi A7 55 TFSI';
const PLATE = 'KS-FS-1234';
const CUSTOMER_NAME = 'Max Mustermann';
const API_ERROR = 'Buchungen konnten nicht geladen werden';

const mockSetScanQuery = vi.fn();
const mockSetFocusedBookingId = vi.fn();
const mockSetSelectedVehicleId = vi.fn();
const mockOpenHandover = vi.fn();

let mockScanQuery = '';
let mockScanSearchState = {
  vehicles: [] as Array<{ id: string; model: string; license: string }>,
  healthMap: new Map<string, unknown>(),
  bookings: [] as Array<{
    bookingId: string;
    vehicleId: string;
    vehicleName: string;
    plate: string;
    customerName: string;
    status: string;
  }>,
  focusedBooking: null as null | {
    bookingId: string;
    vehicleId: string;
    vehicleName: string;
    plate: string;
    customerName: string;
    status: string;
  },
  loading: false,
  bookingsError: null as string | null,
  hasQuery: false,
};

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    scanQuery: mockScanQuery,
    setScanQuery: (value: string) => {
      mockSetScanQuery(value);
      mockScanQuery = value;
    },
    selectedVehicleId: null,
    setSelectedVehicleId: mockSetSelectedVehicleId,
    focusedBookingId: null,
    setFocusedBookingId: mockSetFocusedBookingId,
    refreshToken: 0,
  }),
}));

vi.mock('../context/OperatorDataContext', () => ({
  useOperatorData: () => ({
    tasksByVehicleId: new Map<string, number>(),
  }),
}));

vi.mock('../handover/OperatorHandoverProvider', () => ({
  useOperatorHandover: () => ({
    openHandover: mockOpenHandover,
  }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

vi.mock('../hooks/useOperatorScanSearch', () => ({
  useOperatorScanSearch: () => mockScanSearchState,
}));

vi.mock('../components/OperatorScanVehicleCard', () => ({
  OperatorScanVehicleCard: () => null,
}));

vi.mock('../components/OperatorVehicleQuickView', () => ({
  OperatorVehicleQuickView: () => null,
}));

vi.mock('../components/OperatorBookingDetailSheet', () => ({
  OperatorBookingDetailSheet: () => null,
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorScanEmptyQueryTitle,
  operatorScanNoResultsTitle,
  operatorScanSearchPlaceholder,
  operatorScanSectionBookingsLabel,
} from '../lib/operator-scan-search-i18n';
import { OperatorScanView } from './OperatorScanView';

const P242_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorScanView.tsx',
  'operator/lib/operator-scan-search-i18n.ts',
];

const SCAN_BOOKING = {
  bookingId: BOOKING_ID,
  vehicleId: 'veh-p242-1',
  vehicleName: VEHICLE_NAME,
  plate: PLATE,
  customerName: CUSTOMER_NAME,
  status: 'confirmed',
};

function isP242EnforceCleanPath(relPath: string): boolean {
  return P242_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p242ScopedFindings() {
  return inventory.findings.filter((finding) => isP242EnforceCleanPath(finding.file));
}

function resetScanState() {
  mockScanQuery = '';
  mockScanSearchState = {
    vehicles: [],
    healthMap: new Map(),
    bookings: [],
    focusedBooking: null,
    loading: false,
    bookingsError: null,
    hasQuery: false,
  };
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

function ScanLocaleHarness() {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorScanView),
  );
}

describe('operator scan search UX localization (P2.2.42)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetScanState();
  });

  it('has zero P242 enforce-clean scanner debt', () => {
    expect(p242ScopedFindings()).toHaveLength(0);
  });

  it('renders German no-query empty state', () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorScanView));

    expect(container.textContent).toContain(operatorScanEmptyQueryTitle('de'));
    expect(container.textContent).toContain(de['operator.scan.emptyQueryDescription']);
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input.placeholder).toBe(operatorScanSearchPlaceholder('de'));
    expect(container.textContent).toContain(de['operator.scan.scannerTitle']);

    cleanup();
  });

  it('renders English no-query empty state', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorScanView));

    expect(container.textContent).toContain(operatorScanEmptyQueryTitle('en'));
    expect(container.textContent).toContain(en['operator.scan.emptyQueryDescription']);
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input.placeholder).toBe(operatorScanSearchPlaceholder('en'));
    expect(container.textContent).not.toContain('Kennzeichen eingeben');

    cleanup();
  });

  it('renders German no-results state with raw query preserved in input', () => {
    mockScanQuery = NO_MATCH_QUERY;
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookings: [],
      vehicles: [],
      loading: false,
    };

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorScanView));
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;

    expect(input.value).toBe(NO_MATCH_QUERY);
    expect(container.textContent).toContain(operatorScanNoResultsTitle('de'));
    expect(container.textContent).toContain(de['operator.scan.noResultsDescription']);

    cleanup();
  });

  it('renders English no-results state', () => {
    mockScanQuery = NO_MATCH_QUERY;
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookings: [],
      vehicles: [],
    };

    const { container, cleanup } = renderWithLocale('en', createElement(OperatorScanView));

    expect(container.textContent).toContain(operatorScanNoResultsTitle('en'));
    expect(container.textContent).toContain(en['operator.scan.noResultsDescription']);
    expect(container.textContent).not.toContain('Kein Treffer');

    cleanup();
  });

  it('preserves exact query string across same-mount locale switch', async () => {
    mockScanQuery = QUERY_FIXTURE;
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookings: [SCAN_BOOKING],
      vehicles: [],
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(ScanLocaleHarness)));
    });

    const input = () => container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input().value).toBe(QUERY_FIXTURE);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(operatorScanSectionBookingsLabel('de'));

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(input().value).toBe(QUERY_FIXTURE);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(operatorScanSectionBookingsLabel('en'));
    expect(container.textContent).not.toContain(operatorScanSectionBookingsLabel('de'));

    act(() => root.unmount());
    container.remove();
  });

  it('preserves result booking IDs and order across locale switch', async () => {
    const bookingB = { ...SCAN_BOOKING, bookingId: 'bk-p242-second', customerName: 'Second Customer' };
    const bookingA = { ...SCAN_BOOKING, bookingId: 'bk-p242-first', customerName: 'First Customer' };
    mockScanQuery = 'KS';
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookings: [bookingA, bookingB],
      vehicles: [],
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'en');

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(ScanLocaleHarness)));
    });

    const cardsBefore = container.textContent ?? '';
    expect(cardsBefore.indexOf('First Customer')).toBeLessThan(cardsBefore.indexOf('Second Customer'));

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const cardsAfter = container.textContent ?? '';
    expect(cardsAfter.indexOf('First Customer')).toBeLessThan(cardsAfter.indexOf('Second Customer'));
    expect(cardsAfter).toContain('First Customer');
    expect(cardsAfter).toContain('Second Customer');

    act(() => root.unmount());
    container.remove();
  });

  it('preserves raw API error message without translation', () => {
    mockScanQuery = 'ab';
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookingsError: API_ERROR,
      loading: false,
    };

    const { container, cleanup } = renderWithLocale('en', createElement(OperatorScanView));

    expect(container.textContent).toContain(API_ERROR);

    cleanup();
  });

  it('preserves setScanQuery callback on input change', async () => {
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorScanView));
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      nativeInputValueSetter.call(input, QUERY_FIXTURE);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockSetScanQuery).toHaveBeenCalledWith(QUERY_FIXTURE);
    expect(mockSetFocusedBookingId).toHaveBeenCalledWith(null);

    cleanup();
  });

  it('does not leak raw TranslationKey strings in rendered output', () => {
    mockScanQuery = QUERY_FIXTURE;
    mockScanSearchState = {
      ...mockScanSearchState,
      hasQuery: true,
      bookings: [SCAN_BOOKING],
    };

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorScanView));

    expect(container.textContent).not.toContain('operator.scan.');
    expect(container.textContent).not.toContain('nav.bookings');

    cleanup();
  });
});

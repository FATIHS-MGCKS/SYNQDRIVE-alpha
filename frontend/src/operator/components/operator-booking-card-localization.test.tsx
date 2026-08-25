// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const CUSTOMER_NAME = 'Max Mustermann';
const VEHICLE_NAME = 'Audi A7 55 TFSI';
const PLATE = 'KS-FS-1234';
const STATION = 'Frankfurt Hauptbahnhof';
const TIME_LABEL = '14:30';
const BOOKING_ID = 'bk-p241-scan-42abcdef';

const mockOnPickupStart = vi.fn();
const mockOnReturnStart = vi.fn();
const mockOnDetails = vi.fn();
const mockOnOpenVehicle = vi.fn();
const mockOnPickup = vi.fn();
const mockOnReturn = vi.fn();

const TODAY_ITEM = {
  bookingId: BOOKING_ID,
  kind: 'PICKUP' as const,
  vehicleId: 'veh-p241-1',
  customerId: 'cust-p241-1',
  vehicleName: VEHICLE_NAME,
  plate: PLATE,
  customerName: CUSTOMER_NAME,
  station: STATION,
  scheduledAt: '2026-07-14T10:00:00.000Z',
  timeLabel: TIME_LABEL,
  status: 'confirmed' as const,
  statusLabel: 'Bestätigt',
  isOverdue: true,
  isDueNow: true,
  isDone: false,
  pickupGate: { allowed: true },
  returnGate: { allowed: false, reason: 'Pickup noch nicht erfasst' },
  raw: {} as never,
};

const SCAN_BOOKING = {
  bookingId: BOOKING_ID,
  vehicleId: 'veh-p241-1',
  vehicleName: VEHICLE_NAME,
  plate: PLATE,
  customerName: CUSTOMER_NAME,
  status: 'confirmed',
  statusEnum: 'CONFIRMED',
};

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  bookingStatusLabel,
  type BookingUiStatus,
} from '../../rental/components/bookings/bookingStatus';
import {
  operatorBookingCardDoneLabel,
  operatorBookingCardScanTitle,
  operatorBookingCardStartPickupLabel,
} from '../lib/operator-booking-card-i18n';
import { OperatorBookingCard } from './OperatorBookingCard';
import { OperatorScanBookingCard } from './OperatorScanBookingCard';

const P241_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingCard.tsx',
  'operator/components/OperatorScanBookingCard.tsx',
  'operator/lib/operator-booking-card-i18n.ts',
];

function isP241EnforceCleanPath(relPath: string): boolean {
  return P241_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p241ScopedFindings() {
  return inventory.findings.filter((finding) => isP241EnforceCleanPath(finding.file));
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

function TodayLocaleHarness() {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorBookingCard, {
      item: TODAY_ITEM,
      onPickupStart: mockOnPickupStart,
      onReturnStart: mockOnReturnStart,
      onDetails: mockOnDetails,
    }),
  );
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
    createElement(OperatorScanBookingCard, {
      booking: SCAN_BOOKING,
      onDetails: mockOnDetails,
      onOpenVehicle: mockOnOpenVehicle,
      onPickup: mockOnPickup,
      onReturn: mockOnReturn,
    }),
  );
}

describe('operator booking card localization (P2.2.41)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('has zero P241 enforce-clean scanner debt', () => {
    expect(p241ScopedFindings()).toHaveLength(0);
  });

  it('renders Today card in German with localized host copy', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorBookingCard, {
        item: TODAY_ITEM,
        onPickupStart: mockOnPickupStart,
        onDetails: mockOnDetails,
      }),
    );

    expect(container.textContent).toContain(VEHICLE_NAME);
    expect(container.textContent).toContain(PLATE);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(de['vehicle.bookings.startPickup']);
    expect(container.textContent).toContain(de['common.details']);
    expect(container.textContent).toContain(de['bookings.confirmed']);
    expect(container.textContent).toContain(de['status.overdue']);
    expect(container.textContent).not.toContain('confirmed');

    cleanup();
  });

  it('renders Today card in English with localized host copy', () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorBookingCard, {
        item: TODAY_ITEM,
        onPickupStart: mockOnPickupStart,
        onDetails: mockOnDetails,
      }),
    );

    expect(container.textContent).toContain(en['vehicle.bookings.startPickup']);
    expect(container.textContent).toContain(en['common.details']);
    expect(container.textContent).toContain(en['bookings.confirmed']);
    expect(container.textContent).toContain(en['status.overdue']);
    expect(container.textContent).not.toContain('Bestätigt');
    expect(container.textContent).not.toContain('Überfällig');

    cleanup();
  });

  it('renders Scan card in German with localized host copy', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorScanBookingCard, {
        booking: SCAN_BOOKING,
        onDetails: mockOnDetails,
        onOpenVehicle: mockOnOpenVehicle,
        onPickup: mockOnPickup,
        onReturn: mockOnReturn,
      }),
    );

    const idSlice = `${BOOKING_ID.slice(0, 8)}…`;
    expect(container.textContent).toContain(
      operatorBookingCardScanTitle('de', idSlice),
    );
    expect(container.textContent).toContain(VEHICLE_NAME);
    expect(container.textContent).toContain(PLATE);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(de['bookings.vehicle']);
    expect(container.textContent).toContain(de['operator.bookings.documents.group.pickup']);
    expect(container.textContent).toContain(de['operator.bookings.documents.group.return']);
    expect(container.textContent).not.toContain('Booking ·');

    cleanup();
  });

  it('renders Scan card in English with localized host copy', () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorScanBookingCard, {
        booking: SCAN_BOOKING,
        onDetails: mockOnDetails,
        onOpenVehicle: mockOnOpenVehicle,
        onPickup: mockOnPickup,
        onReturn: mockOnReturn,
      }),
    );

    const idSlice = `${BOOKING_ID.slice(0, 8)}…`;
    expect(container.textContent).toContain(
      operatorBookingCardScanTitle('en', idSlice),
    );
    expect(container.textContent).toContain(en['bookings.vehicle']);
    expect(container.textContent).toContain(en['bookings.confirmed']);
    expect(container.textContent).not.toContain('Buchung ·');

    cleanup();
  });

  it('preserves dynamic data across Today same-mount locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(TodayLocaleHarness)));
    });

    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(VEHICLE_NAME);
    expect(container.textContent).toContain(PLATE);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(de['vehicle.bookings.startPickup']);

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(VEHICLE_NAME);
    expect(container.textContent).toContain(PLATE);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(en['vehicle.bookings.startPickup']);
    expect(container.textContent).not.toContain(de['vehicle.bookings.startPickup']);

    act(() => root.unmount());
    container.remove();
  });

  it('preserves dynamic data across Scan same-mount locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(ScanLocaleHarness)));
    });

    const idSlice = `${BOOKING_ID.slice(0, 8)}…`;
    expect(container.textContent).toContain(idSlice);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(VEHICLE_NAME);

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(idSlice);
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(VEHICLE_NAME);
    expect(container.textContent).toContain(en['bookings.vehicle']);

    act(() => root.unmount());
    container.remove();
  });

  it('maps Today status without machine-code leakage', () => {
    const statuses: BookingUiStatus[] = [
      'pending',
      'confirmed',
      'active',
      'completed',
      'cancelled',
      'no_show',
    ];

    for (const status of statuses) {
      const { container, cleanup } = renderWithLocale(
        'en',
        createElement(OperatorBookingCard, {
          item: { ...TODAY_ITEM, status, statusLabel: 'ignored' },
        }),
      );
      expect(container.textContent).toContain(bookingStatusLabel(status, 'en'));
      expect(container.textContent).not.toContain(status);
      cleanup();
    }
  });

  it('preserves Today details and pickup callbacks', async () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorBookingCard, {
        item: TODAY_ITEM,
        onPickupStart: mockOnPickupStart,
        onDetails: mockOnDetails,
      }),
    );

    const detailsButtons = Array.from(container.querySelectorAll('button')).filter((btn) =>
      btn.textContent?.includes(de['common.details']),
    );
    expect(detailsButtons.length).toBeGreaterThan(0);
    await act(async () => {
      detailsButtons[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOnDetails).toHaveBeenCalledTimes(1);

    const pickupButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(operatorBookingCardStartPickupLabel('de')),
    );
    await act(async () => {
      pickupButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOnPickupStart).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('preserves Scan workflow callbacks', async () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorScanBookingCard, {
        booking: SCAN_BOOKING,
        onDetails: mockOnDetails,
        onOpenVehicle: mockOnOpenVehicle,
        onPickup: mockOnPickup,
        onReturn: mockOnReturn,
      }),
    );

    const detailsButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(en['common.details']),
    );
    await act(async () => {
      detailsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOnDetails).toHaveBeenCalledTimes(1);

    const vehicleButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(en['bookings.vehicle']),
    );
    await act(async () => {
      vehicleButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOnOpenVehicle).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('renders Today done chip via localized label', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorBookingCard, {
        item: { ...TODAY_ITEM, isDone: true, isOverdue: false },
      }),
    );

    expect(container.textContent).toContain(operatorBookingCardDoneLabel('de'));
    cleanup();
  });

  it('does not leak raw TranslationKey strings in rendered output', () => {
    const { container: todayDe, cleanup: cleanupTodayDe } = renderWithLocale(
      'de',
      createElement(OperatorBookingCard, { item: TODAY_ITEM, onDetails: mockOnDetails }),
    );
    const { container: scanEn, cleanup: cleanupScanEn } = renderWithLocale(
      'en',
      createElement(OperatorScanBookingCard, { booking: SCAN_BOOKING, onDetails: mockOnDetails }),
    );

    expect(todayDe.textContent).not.toContain('operator.bookings.card.');
    expect(todayDe.textContent).not.toContain('vehicle.bookings.');
    expect(scanEn.textContent).not.toContain('operator.bookings.card.');
    expect(scanEn.textContent).not.toContain('bookings.vehicle');

    cleanupTodayDe();
    cleanupScanEn();
  });
});

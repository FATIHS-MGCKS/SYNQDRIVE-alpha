// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockOpenSheet = vi.fn();
const mockTriggerRefresh = vi.fn();
const mockOnClose = vi.fn();
const mockOnPickupStart = vi.fn();
const mockOnReturnStart = vi.fn();

const CUSTOMER_NAME = 'Max Mustermann';
const VEHICLE_NAME = 'Audi A7 55 TFSI';
const PLATE = 'KS-FS-1234';
const STATION = 'Frankfurt Hauptbahnhof';
const TIME_LABEL = '14:30';
const BLOCKING_REASON = 'TÜV abgelaufen';

const BOOKING_DETAIL = {
  core: {
    bookingId: 'bk-p240-42',
    statusEnum: 'CONFIRMED',
    status: 'confirmed',
    startDate: '2026-07-14T10:00:00.000Z',
    endDate: '2026-07-16T10:00:00.000Z',
    pickupStationName: STATION,
    returnStationName: STATION,
  },
  customer: {
    customerId: 'cust-p240-1',
    fullName: CUSTOMER_NAME,
    email: 'max.mustermann+booking@example.com',
    phone: '+49 170 1234567',
  },
  vehicle: {
    vehicleId: 'veh-p240-1',
    displayName: VEHICLE_NAME,
    licensePlate: PLATE,
    rentalBlocked: false,
  },
  handover: { pickup: null, return: null },
  health: { rentalBlocked: false, blockingReasons: [] },
  eligibility: { canStartRental: true, blockingReasons: [] },
  documents: { legalTermsAttached: true, legalWithdrawalAttached: true },
  finance: { finalInvoiceStatus: null },
};

const TODAY_ITEM = {
  bookingId: 'bk-p240-42',
  kind: 'PICKUP' as const,
  vehicleId: 'veh-p240-1',
  customerId: 'cust-p240-1',
  vehicleName: VEHICLE_NAME,
  plate: PLATE,
  customerName: CUSTOMER_NAME,
  station: STATION,
  scheduledAt: '2026-07-14T10:00:00.000Z',
  timeLabel: TIME_LABEL,
  status: 'confirmed' as const,
  statusLabel: 'Bestätigt',
  isOverdue: false,
  isDueNow: true,
  isDone: false,
  pickupGate: { allowed: true },
  returnGate: { allowed: false, reason: 'Pickup noch nicht erfasst' },
  raw: {} as never,
};

vi.mock('../../lib/api', () => ({
  api: {
    bookings: {
      detail: vi.fn(async () => BOOKING_DETAIL),
    },
  },
}));

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    openSheet: mockOpenSheet,
    triggerRefresh: mockTriggerRefresh,
  }),
}));

vi.mock('../documents/OperatorBookingDocumentsPanel', () => ({
  OperatorBookingDocumentsPanel: () => null,
}));

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorBookingDetailEyebrow,
  operatorBookingDetailManageSectionTitle,
  operatorBookingDetailStartPickupLabel,
} from '../lib/operator-booking-detail-i18n';
import { OperatorBookingDetailSheet } from './OperatorBookingDetailSheet';

const P240_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingDetailSheet.tsx',
  'operator/lib/operator-booking-detail-i18n.ts',
];

function isP240EnforceCleanPath(relPath: string): boolean {
  return P240_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p240ScopedFindings() {
  return inventory.findings.filter((finding) => isP240EnforceCleanPath(finding.file));
}

function renderDetailSheet(locale: 'de' | 'en') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(OperatorBookingDetailSheet, {
          item: TODAY_ITEM,
          onClose: mockOnClose,
          onPickupStart: mockOnPickupStart,
          onReturnStart: mockOnReturnStart,
        }),
      ),
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
    createElement(OperatorBookingDetailSheet, {
      item: TODAY_ITEM,
      onClose: mockOnClose,
      onPickupStart: mockOnPickupStart,
      onReturnStart: mockOnReturnStart,
    }),
  );
}

describe('operator booking detail sheet localization (P2.2.40)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('has zero P240 enforce-clean scanner debt', () => {
    expect(p240ScopedFindings()).toHaveLength(0);
  });

  it('renders German host-owned labels with preserved dynamic data', async () => {
    const { container, cleanup } = renderDetailSheet('de');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(operatorBookingDetailEyebrow('de'));
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(`${VEHICLE_NAME} · ${PLATE}`);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(de['bookings.confirmed']);
    expect(container.textContent).toContain(operatorBookingDetailManageSectionTitle('de'));
    expect(container.textContent).not.toContain(en['operator.bookings.detail.manageSection']);

    cleanup();
  });

  it('renders English host-owned labels with preserved dynamic data', async () => {
    const { container, cleanup } = renderDetailSheet('en');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(operatorBookingDetailEyebrow('en'));
    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(`${VEHICLE_NAME} · ${PLATE}`);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(en['bookings.confirmed']);
    expect(container.textContent).toContain(operatorBookingDetailManageSectionTitle('en'));
    expect(container.textContent).not.toContain(de['operator.bookings.detail.manageSection']);

    cleanup();
  });

  it('preserves dynamic data and booking ID across same-mount locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(
        createElement(LanguageProvider, null, createElement(LocaleSwitchHarness)),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(operatorBookingDetailManageSectionTitle('de'));

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain(CUSTOMER_NAME);
    expect(container.textContent).toContain(`${VEHICLE_NAME} · ${PLATE}`);
    expect(container.textContent).toContain(STATION);
    expect(container.textContent).toContain(TIME_LABEL);
    expect(container.textContent).toContain(operatorBookingDetailManageSectionTitle('en'));
    expect(container.textContent).not.toContain(operatorBookingDetailManageSectionTitle('de'));

    act(() => root.unmount());
    container.remove();
  });

  it('keeps pickup-start callback and booking ID unchanged', async () => {
    const { container, cleanup } = renderDetailSheet('de');
    await act(async () => {
      await Promise.resolve();
    });

    const pickupButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(operatorBookingDetailStartPickupLabel('de')),
    );
    expect(pickupButton).toBeTruthy();

    await act(async () => {
      pickupButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnPickupStart).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'bk-p240-42' }),
    );

    cleanup();
  });

  it('opens booking-edit sheet with frozen booking ID', async () => {
    const { container, cleanup } = renderDetailSheet('de');
    await act(async () => {
      await Promise.resolve();
    });

    const editButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(de['common.edit']),
    );
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOpenSheet).toHaveBeenCalledWith({
      type: 'booking-edit',
      bookingId: 'bk-p240-42',
    });

    cleanup();
  });

  it('maps confirmed status to localized label without leaking machine codes', async () => {
    const { container, cleanup } = renderDetailSheet('en');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(en['bookings.confirmed']);
    expect(container.textContent).not.toContain('CONFIRMED');

    cleanup();
  });

  it('does not translate health blocking reasons', async () => {
    const { api } = await import('../../lib/api');
    vi.mocked(api.bookings.detail).mockResolvedValueOnce({
      ...BOOKING_DETAIL,
      health: { rentalBlocked: true, blockingReasons: [BLOCKING_REASON] },
    } as never);

    const { container, cleanup } = renderDetailSheet('de');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(BLOCKING_REASON);
    expect(container.textContent).toContain(de['operator.bookings.detail.vehicleBlocked']);

    cleanup();
  });
});

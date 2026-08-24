// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCreateBooking = vi.fn();
const mockUpdateBooking = vi.fn();
const mockCloseSheet = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    stations: { list: vi.fn(async () => [{ id: 'st-1', name: 'Hauptstation Mitte' }]) },
    customers: {
      list: vi.fn(async () => ({
        data: [{ id: 'cust-1', name: 'Muster Kunde GmbH', email: 'kontakt@muster.de', phone: '+49 30 123' }],
      })),
      get: vi.fn(async () => ({
        id: 'cust-1',
        name: 'Muster Kunde GmbH',
        email: 'kontakt@muster.de',
        phone: '+49 30 123',
      })),
    },
    bookings: {
      detail: vi.fn(async () => ({
        core: {
          id: 'bk-99',
          bookingNumber: 'BK-2026-0042',
          startDate: '2026-08-24T10:00:00.000Z',
          endDate: '2026-08-25T10:00:00.000Z',
          pickupStationId: 'st-1',
          returnStationId: 'st-1',
          notes: 'VIP Übergabe – Kunde ruft 15 Min vorher an.',
          kmIncluded: 300,
        },
        customer: {
          customerId: 'cust-1',
          fullName: 'Muster Kunde GmbH',
          email: 'kontakt@muster.de',
          phone: '+49 30 123',
        },
        vehicle: { vehicleId: 'veh-1' },
      })),
    },
  },
}));

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({ closeSheet: mockCloseSheet }),
}));

vi.mock('../hooks/useOperatorVehiclesData', () => ({
  useOperatorVehiclesData: () => ({
    allVehicles: [
      { id: 'veh-1', model: 'VW Golf', license: 'B-AB 1234', station: 'Hauptstation', stationId: 'st-1' },
    ],
  }),
}));

vi.mock('../hooks/useOperatorBookingMutations', () => ({
  useOperatorBookingMutations: () => ({
    mutating: false,
    error: null,
    clearError: vi.fn(),
    createBooking: mockCreateBooking,
    updateBooking: mockUpdateBooking,
  }),
}));

vi.mock('../../rental/hooks/usePricingSimulation', () => ({
  usePricingSimulation: () => ({
    result: { quoteId: 'quote-1', totalGrossCents: 12500, currency: 'EUR' },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorBookingFormStatusLabel,
  operatorBookingFormTitle,
} from '../lib/operator-booking-form-i18n';
import { OperatorBookingFormSheet } from './OperatorBookingFormSheet';

const P236_ENFORCE_CLEAN_EXACT = [
  'operator/bookings/OperatorBookingFormSheet.tsx',
  'operator/lib/operator-booking-form-i18n.ts',
];

const CUSTOMER_FIXTURE = 'Muster Kunde GmbH';
const NOTES_FIXTURE = 'VIP Übergabe – Kunde ruft 15 Min vorher an.';

function isP236EnforceCleanPath(relPath: string): boolean {
  return P236_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p236ScopedFindings() {
  return inventory.findings.filter((finding) => isP236EnforceCleanPath(finding.file));
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
    createElement(OperatorBookingFormSheet, {
      action: {
        type: 'booking-create',
        prefillCustomerId: 'cust-1',
        prefillStartDate: '2026-08-24T10:00:00.000Z',
        prefillEndDate: '2026-08-25T10:00:00.000Z',
      },
    }),
  );
}

describe('operator Booking Form Sheet localization (P2.2.36)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P236 scoped findings', () => {
      expect(p236ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN create mode', () => {
    it('renders localized labels and preserves dynamic customer data', async () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorBookingFormSheet, {
          action: { type: 'booking-create', prefillCustomerId: 'cust-1' },
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.textContent).toContain(en['operator.bookings.form.createTitle']);
      expect(view.container.textContent).toContain(en['bookings.customer']);
      expect(view.container.textContent).toContain(en['operator.bookings.form.pickupRequired']);
      expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);
      expect(operatorBookingFormStatusLabel('en', 'PENDING')).toBe(en['bookings.planner.pending']);
    });
  });

  describe('DE create mode', () => {
    it('renders localized labels', async () => {
      const view = renderWithLocale(
        'de',
        createElement(OperatorBookingFormSheet, {
          action: { type: 'booking-create' },
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.textContent).toContain(de['operator.bookings.form.createTitle']);
      expect(view.container.textContent).toContain(de['bookings.customer']);
      expect(view.container.textContent).toContain(de['operator.bookings.form.pickupRequired']);
    });
  });

  describe('edit mode', () => {
    it('renders edit title and preserves booking number and notes', async () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorBookingFormSheet, {
          action: { type: 'booking-edit', bookingId: 'bk-99' },
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.textContent).toContain(en['bookings.edit.title']);
      expect(view.container.textContent).toContain('BK-2026-0042');
      const notesInput = view.container.querySelector('textarea') as HTMLTextAreaElement;
      expect(notesInput?.value).toBe(NOTES_FIXTURE);
    });
  });

  describe('machine value freeze', () => {
    it('keeps status machine values while localizing labels', () => {
      expect(operatorBookingFormStatusLabel('en', 'CONFIRMED')).toBe(en['bookings.confirmed']);
      expect(operatorBookingFormStatusLabel('de', 'PENDING')).toBe(de['bookings.planner.pending']);
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without losing customer fixture text', async () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness));
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.textContent).toContain(de['operator.bookings.form.createTitle']);
      expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(view.container.textContent).toContain(en['operator.bookings.form.createTitle']);
      expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);
      expect(view.container.textContent).not.toContain('operator.bookings.form');
    });
  });

  describe('raw key and machine-code leakage guards', () => {
    it('does not render raw translation keys or status machine codes', async () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorBookingFormSheet, {
          action: { type: 'booking-create' },
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.textContent).not.toContain('operator.bookings.form');
      expect(view.container.textContent).not.toContain('PENDING');
      expect(operatorBookingFormTitle('de', 'edit')).toBe(de['bookings.edit.title']);
    });
  });
});

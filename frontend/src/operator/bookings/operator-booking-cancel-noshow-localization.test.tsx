// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCancelBooking = vi.fn();
const mockMarkNoShow = vi.fn();
const mockCloseSheet = vi.fn();

const BOOKING_DETAIL = {
  core: {
    id: 'bk-42',
    bookingNumber: 'BK-2026-0042',
    statusEnum: 'CONFIRMED',
    status: 'confirmed',
    startDate: '2026-07-14T10:00:00.000Z',
    endDate: '2026-07-16T10:00:00.000Z',
  },
  customer: {
    customerId: 'cust-1',
    fullName: 'Muster Kunde GmbH',
    email: 'kontakt@muster.de',
    phone: '+49 30 123',
  },
  vehicle: {
    vehicleId: 'veh-1',
    displayName: 'VW Golf',
    licensePlate: 'B-AB 1234',
    rentalBlocked: false,
  },
  handover: { pickup: null, return: null },
  health: { rentalBlocked: false, blockingReasons: [] },
  eligibility: { canStartRental: true, blockingReasons: [] },
  documents: { legalTermsAttached: true, legalWithdrawalAttached: true },
  finance: { finalInvoiceStatus: null },
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
  useOperatorShell: () => ({ closeSheet: mockCloseSheet }),
}));

vi.mock('../hooks/useOperatorBookingMutations', () => ({
  useOperatorBookingMutations: () => ({
    mutating: false,
    error: null,
    clearError: vi.fn(),
    cancelBooking: mockCancelBooking,
    markNoShow: mockMarkNoShow,
  }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorBookingCancelSheetTitle,
  operatorBookingNoShowSheetTitle,
} from '../lib/operator-booking-cancel-noshow-i18n';
import { OperatorBookingCancelSheet } from './OperatorBookingCancelSheet';
import { OperatorBookingNoShowSheet } from './OperatorBookingNoShowSheet';

const P237_ENFORCE_CLEAN_EXACT = [
  'operator/bookings/OperatorBookingCancelSheet.tsx',
  'operator/bookings/OperatorBookingNoShowSheet.tsx',
  'operator/bookings/operatorBookingSheetShell.tsx',
  'operator/lib/operator-booking-cancel-noshow-i18n.ts',
];

const CUSTOMER_FIXTURE = 'Muster Kunde GmbH';
const VEHICLE_FIXTURE = 'VW Golf';
const PLATE_FIXTURE = 'B-AB 1234';
const BOOKING_NUMBER_FIXTURE = 'BK-2026-0042';
const FREEFORM_REASON_FIXTURE = 'Kunde storniert wegen Flugausfall XYZ-42';

function isP237EnforceCleanPath(relPath: string): boolean {
  return P237_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p237ScopedFindings() {
  return inventory.findings.filter((finding) => isP237EnforceCleanPath(finding.file));
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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const textareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  textareaSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function NoShowLocaleSwitchHarness() {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorBookingNoShowSheet, {
      action: { type: 'booking-no-show', bookingId: 'bk-42' },
    }),
  );
}

describe('operator Booking Cancel & No-Show localization (P2.2.37)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('reports zero P237 scoped findings', () => {
    expect(p237ScopedFindings()).toHaveLength(0);
  });

  it('renders cancel sheet in DE with preserved dynamic booking data', async () => {
    const view = renderWithLocale(
      'de',
      createElement(OperatorBookingCancelSheet, {
        action: { type: 'booking-cancel', bookingId: 'bk-42' },
      }),
    );
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain(operatorBookingCancelSheetTitle('de'));
    expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);
    expect(view.container.textContent).toContain(VEHICLE_FIXTURE);
    expect(view.container.textContent).toContain(PLATE_FIXTURE);
    expect(view.container.textContent).toContain(BOOKING_NUMBER_FIXTURE);
    expect(view.container.textContent).toContain(de['bookings.customer']);
    expect(view.container.textContent).not.toContain(en['operator.bookings.cancelNoShow.cancel.title']);
  });

  it('renders cancel sheet in EN with preserved dynamic booking data', async () => {
    const view = renderWithLocale(
      'en',
      createElement(OperatorBookingCancelSheet, {
        action: { type: 'booking-cancel', bookingId: 'bk-42' },
      }),
    );
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain(operatorBookingCancelSheetTitle('en'));
    expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);
    expect(view.container.textContent).toContain(BOOKING_NUMBER_FIXTURE);
    expect(view.container.textContent).toContain(en['bookings.customer']);
    expect(view.container.textContent).not.toContain(de['operator.bookings.cancelNoShow.cancel.title']);
  });

  it('renders no-show sheet in DE and EN with distinct titles', async () => {
    const deView = renderWithLocale(
      'de',
      createElement(OperatorBookingNoShowSheet, {
        action: { type: 'booking-no-show', bookingId: 'bk-42' },
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(deView.container.textContent).toContain(operatorBookingNoShowSheetTitle('de'));
    expect(deView.container.textContent).toContain(
      de['operator.bookings.cancelNoShow.noShow.warningTitle'],
    );
    deView.cleanup();

    const enView = renderWithLocale(
      'en',
      createElement(OperatorBookingNoShowSheet, {
        action: { type: 'booking-no-show', bookingId: 'bk-42' },
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(enView.container.textContent).toContain(operatorBookingNoShowSheetTitle('en'));
    expect(enView.container.textContent).toContain(
      en['operator.bookings.cancelNoShow.noShow.warningTitle'],
    );
    enView.cleanup();
  });

  it('preserves freeform no-show reason across locale switch on same mount', async () => {
    const view = renderWithLocale('de', createElement(NoShowLocaleSwitchHarness));
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });

    const textarea = view.container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    act(() => setTextareaValue(textarea, FREEFORM_REASON_FIXTURE));

    const toggle = view.container.querySelector('button') as HTMLButtonElement;
    act(() => toggle.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      FREEFORM_REASON_FIXTURE,
    );
    expect(view.container.textContent).toContain(CUSTOMER_FIXTURE);
    expect(view.container.textContent).toContain(BOOKING_NUMBER_FIXTURE);
  });

  it('invokes cancel mutation with unchanged booking id', async () => {
    const view = renderWithLocale(
      'en',
      createElement(OperatorBookingCancelSheet, {
        action: { type: 'booking-cancel', bookingId: 'bk-42' },
      }),
    );
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });

    const submit = Array.from(view.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(en['operator.bookings.cancelNoShow.cancel.submit']),
    );
    expect(submit).toBeTruthy();
    await act(async () => {
      submit?.click();
    });
    expect(mockCancelBooking).toHaveBeenCalledWith(
      'bk-42',
      'veh-1',
      expect.any(Function),
      en['operator.bookings.cancelNoShow.toast.cancelled'],
    );
  });

  it('invokes no-show mutation with unchanged booking id and freeform reason', async () => {
    const view = renderWithLocale(
      'de',
      createElement(OperatorBookingNoShowSheet, {
        action: { type: 'booking-no-show', bookingId: 'bk-42' },
      }),
    );
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });

    const textarea = view.container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setTextareaValue(textarea, FREEFORM_REASON_FIXTURE));

    const submit = Array.from(view.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(de['operator.bookings.cancelNoShow.noShow.submit']),
    );
    await act(async () => {
      submit?.click();
    });

    expect(mockMarkNoShow).toHaveBeenCalledWith(
      'bk-42',
      'veh-1',
      FREEFORM_REASON_FIXTURE,
      expect.any(Function),
      de['operator.bookings.cancelNoShow.toast.noShowMarked'],
    );
  });

  it('does not render raw translation keys or status machine codes', async () => {
    const view = renderWithLocale(
      'en',
      createElement(OperatorBookingCancelSheet, {
        action: { type: 'booking-cancel', bookingId: 'bk-42' },
      }),
    );
    cleanup = view.cleanup;
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.container.textContent).not.toContain('operator.bookings.cancelNoShow');
    expect(view.container.textContent).not.toContain('CONFIRMED');
  });
});

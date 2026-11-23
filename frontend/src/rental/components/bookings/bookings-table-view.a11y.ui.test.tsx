// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, translateKey } from '../../../i18n/LanguageContext';
import { DEFAULT_PRODUCT_LOCALE } from '../../../i18n/locales';

vi.mock('../ui/Icon', () => ({
  Icon: () => createElement('span', { 'data-testid': 'icon' }),
}));
import type { BookingUiRow } from '../../lib/entityMappers';
import { BookingsTableView } from './BookingsTableView';
import { bookingRef } from './bookingUtils';

function sampleRow(id: string, statusEnum: string, uiStatus: BookingUiRow['status']): BookingUiRow {
  return {
    id,
    vehicleId: 'veh-1',
    customerId: 'cust-1',
    customer: 'Test Kunde',
    customerPhone: '',
    vehicle: 'VW Golf',
    plate: 'M-AB 1',
    startDate: '10.07.2026',
    endDate: '12.07.2026',
    startTime: '08:00',
    endTime: '08:00',
    startMonth: 6,
    startYear: 2026,
    startDay: 10,
    endDay: 12,
    endMonth: 6,
    endYear: 2026,
    pickupLocation: 'Haupt',
    returnLocation: 'Haupt',
    revenue: '€100',
    status: uiStatus,
    bookingRef: bookingRef(id),
    insurance: '',
    paymentMethod: '',
    fuelLevel: '',
    mileageStart: null,
    mileageEnd: null,
    notes: '',
    includedKm: 300,
    drivenKm: null,
    drivingScore: null,
    drivingBehavior: null,
    abuseDetection: null,
    bookingSource: 'manual',
    bookedBy: '',
    pickupHandoverBy: null,
    returnHandoverBy: null,
    pickupProtocol: null,
    returnProtocol: null,
    extras: [],
    totalPriceCents: 10000,
    _raw: { statusEnum, startDate: '2026-07-10T08:00:00.000Z', endDate: '2026-07-12T08:00:00.000Z' },
  };
}

describe('BookingsTableView a11y (UX-011 closeout)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes keyboard-open action with localized name on every row', () => {
    const onRowClick = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const rows = [
      sampleRow('completed-1', 'COMPLETED', 'completed'),
      sampleRow('confirmed-1', 'CONFIRMED', 'confirmed'),
    ];
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(BookingsTableView, {
            rows,
            loading: false,
            onRowClick,
            onEdit: vi.fn(),
            onCancel: vi.fn(),
          }),
        ),
      );
    });
    const ref = bookingRef('completed-1');
    const expected = translateKey(DEFAULT_PRODUCT_LOCALE, 'bookings.planner.openBookingAria', { ref }).text;
    const openButtons = Array.from(document.body.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-label') === expected || b.getAttribute('aria-label')?.includes(ref),
    );
    expect(openButtons.length).toBeGreaterThanOrEqual(1);
    expect(openButtons[0].getAttribute('aria-label')).toBe(expected);
  });

  it('opens detail from keyboard control without duplicate row handler', () => {
    const onRowClick = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const rows = [sampleRow('done-99', 'COMPLETED', 'completed')];
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(BookingsTableView, {
            rows,
            loading: false,
            onRowClick,
          }),
        ),
      );
    });
    const ref = bookingRef('done-99');
    const openLabel = translateKey(DEFAULT_PRODUCT_LOCALE, 'bookings.planner.openBookingAria', { ref }).text;
    const open = document.body.querySelector(`button[aria-label="${openLabel}"]`) as HTMLButtonElement;
    const row = document.body.querySelector('tbody tr') as HTMLTableRowElement;
    act(() => {
      open.click();
    });
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith('done-99');
    onRowClick.mockClear();
    act(() => {
      row.click();
    });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
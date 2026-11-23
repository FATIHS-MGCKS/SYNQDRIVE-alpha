import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BookingUiRow } from '../../lib/entityMappers';
import { BookingsPage } from './BookingsPage';
import { bookingRef } from './bookingUtils';

vi.mock('../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      if (params && 'count' in params) {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

function row(id: string): BookingUiRow {
  return {
    id,
    vehicleId: 'veh-1',
    customerId: 'cust-1',
    customer: 'Test',
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
    status: 'confirmed',
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
    _raw: {
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-10T08:00:00.000Z',
      endDate: '2026-07-12T08:00:00.000Z',
    },
  };
}

const baseProps = {
  loading: false,
  refreshing: false,
  error: null as string | null,
  listTruncated: false,
  onRetry: () => undefined,
  fleetVehicles: [] as import('../../data/vehicles').VehicleData[],
  stations: [] as { id: string; name: string }[],
  onOpenDetail: () => undefined,
  onOpenDrawer: () => undefined,
};

describe('BookingsPage presentation states', () => {
  it('uses skeleton rows for initial loading', () => {
    const html = renderToStaticMarkup(
      <BookingsPage {...baseProps} bookings={[]} loading error={null} />,
    );
    expect(html).toContain('aria-hidden');
    expect(html).not.toContain('loader-2');
  });

  it('shows fatal error with retry when load fails without cache', () => {
    const html = renderToStaticMarkup(
      <BookingsPage
        {...baseProps}
        bookings={[]}
        loading={false}
        error="Load failed"
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Load failed');
    expect(html).toContain('bookings.planner.retry');
  });

  it('keeps cached rows visible under partial error', () => {
    const html = renderToStaticMarkup(
      <BookingsPage
        {...baseProps}
        bookings={[row('bk-1')]}
        error="Stale fetch"
      />,
    );
    expect(html).toContain('Stale fetch');
    expect(html).toContain('bookings.planner.retry');
    expect(html).toContain('bookings.planner.footer:1');
  });

  it('distinguishes empty dataset from filter-empty copy', () => {
    const emptyHtml = renderToStaticMarkup(
      <BookingsPage {...baseProps} bookings={[]} loading={false} />,
    );
    expect(emptyHtml).toContain('bookings.noBookings');

    const filteredHtml = renderToStaticMarkup(
      <BookingsPage
        {...baseProps}
        bookings={[
          {
            ...row('bk-cancelled'),
            status: 'cancelled',
            _raw: {
              statusEnum: 'CANCELLED',
              startDate: '2026-07-10T08:00:00.000Z',
              endDate: '2026-07-12T08:00:00.000Z',
            },
          },
        ]}
        loading={false}
      />,
    );
    expect(filteredHtml).toContain('bookings.planner.emptyTitle');
  });

  it('shows refresh status without hiding populated views', () => {
    const html = renderToStaticMarkup(
      <BookingsPage
        {...baseProps}
        bookings={[row('bk-1')]}
        refreshing
      />,
    );
    expect(html).toContain('bookings.planner.loading');
    expect(html).toContain('bookings.planner.footer:1');
  });
});
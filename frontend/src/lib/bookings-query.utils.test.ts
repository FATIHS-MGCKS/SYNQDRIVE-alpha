import { describe, expect, it } from 'vitest';
import { buildBookingPlannerListParams } from './bookings-query.utils';
import type { BookingFiltersState } from '../rental/components/bookings/bookingTypes';

const baseFilters: BookingFiltersState = {
  search: '',
  status: 'all',
  vehicleId: null,
  stationId: null,
  dateFrom: null,
  dateTo: null,
  showTerminal: false,
};

describe('buildBookingPlannerListParams', () => {
  it('maps table filters to paginated query params with sort', () => {
    const params = buildBookingPlannerListParams({
      filters: {
        ...baseFilters,
        search: '  BK-12 ',
        status: 'confirmed',
        vehicleId: 'veh-1',
        stationId: 'sta-1',
      },
      view: 'table',
      visibleRange: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
      tablePage: 2,
      tablePageSize: 50,
      sortBy: 'endDate',
      sortOrder: 'asc',
      search: 'BK-12',
    });

    expect(params).toMatchObject({
      search: 'BK-12',
      status: 'CONFIRMED',
      vehicleId: 'veh-1',
      stationId: 'sta-1',
      page: 2,
      limit: 50,
      sortBy: 'endDate',
      sortOrder: 'asc',
      excludeTerminal: true,
    });
    expect(params.from).toBeUndefined();
    expect(params.to).toBeUndefined();
  });

  it('maps timeline view to bounded range without page params', () => {
    const params = buildBookingPlannerListParams({
      filters: baseFilters,
      view: 'timeline',
      visibleRange: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' },
      tablePage: 1,
      tablePageSize: 50,
      sortBy: 'startDate',
      sortOrder: 'desc',
      search: '',
    });

    expect(params.from).toBe('2026-07-01T00:00:00.000Z');
    expect(params.to).toBe('2026-07-08T00:00:00.000Z');
    expect(params.page).toBeUndefined();
    expect(params.limit).toBeUndefined();
  });

  it('prefers explicit date filters over visible range', () => {
    const params = buildBookingPlannerListParams({
      filters: {
        ...baseFilters,
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-06-30T00:00:00.000Z',
      },
      view: 'calendar',
      visibleRange: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
      tablePage: 1,
      tablePageSize: 50,
      sortBy: 'startDate',
      sortOrder: 'desc',
      search: '',
    });

    expect(params.from).toBe('2026-06-01T00:00:00.000Z');
    expect(params.to).toBe('2026-06-30T00:00:00.000Z');
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useBookingsPlannerData } from './useBookingsPlannerData';
import type { BookingFiltersState } from '../components/bookings/bookingTypes';

vi.mock('../../lib/bookings-pagination', () => ({
  fetchBookingListPage: vi.fn(),
  fetchAllBookingsInRange: vi.fn(),
  isAbortError: (error: unknown) =>
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && error.name === 'AbortError',
}));

vi.mock('../lib/entityMappers', () => ({
  mapApiBooking: vi.fn((row: { id: string }) => ({
    id: row.id,
    customer: 'Test Customer',
    vehicle: 'Test Vehicle',
    plate: 'AB-123',
    startDate: '1 Jul 2026',
    endDate: '3 Jul 2026',
  })),
}));

import { fetchAllBookingsInRange, fetchBookingListPage } from '../../lib/bookings-pagination';

const filters: BookingFiltersState = {
  search: '',
  status: 'all',
  vehicleId: null,
  stationId: null,
  dateFrom: null,
  dateTo: null,
  showTerminal: false,
};

const baseInput = {
  orgId: 'org-1',
  view: 'table' as const,
  filters,
  timelineRange: 'week' as const,
  calendarMonth: 6,
  calendarYear: 2026,
  timelineAnchorDateOnly: '2026-07-15',
  tablePage: 1,
  sortBy: 'startDate' as const,
  sortOrder: 'desc' as const,
};

describe('useBookingsPlannerData', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBookingListPage).mockResolvedValue({
      data: [{ id: 'b1', status: 'CONFIRMED' }],
      meta: {
        total: 120,
        page: 1,
        limit: 50,
        totalPages: 3,
        hasNextPage: true,
        nextCursor: 'cursor-1',
      },
    });
    vi.mocked(fetchAllBookingsInRange).mockResolvedValue({
      data: [{ id: 'b-range', status: 'ACTIVE' }],
      meta: {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
        hasNextPage: false,
        nextCursor: null,
      },
    });
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('loads paginated table data with sort and page params', async () => {
    const { result, unmount } = renderHook(() =>
      useBookingsPlannerData({
        ...baseInput,
        tablePage: 2,
        sortBy: 'endDate',
        sortOrder: 'asc',
      }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.rows.length === 1);

    expect(fetchBookingListPage).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        page: 2,
        limit: 50,
        sortBy: 'endDate',
        sortOrder: 'asc',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.meta?.total).toBe(120);
    expect(result.current.error).toBeNull();
  });

  it('loads timeline range data when view is timeline', async () => {
    const { result, unmount } = renderHook(() =>
      useBookingsPlannerData({
        ...baseInput,
        view: 'timeline',
      }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.rows.length === 1);

    expect(fetchAllBookingsInRange).toHaveBeenCalled();
    expect(fetchBookingListPage).not.toHaveBeenCalled();
    expect(result.current.rows).toHaveLength(1);
  });

  it('surfaces API errors instead of an empty list', async () => {
    vi.mocked(fetchBookingListPage).mockRejectedValue(new Error('Server unavailable'));

    const { result, unmount } = renderHook(() => useBookingsPlannerData(baseInput));
    unmountCurrent = unmount;

    await waitForHook(() => !result.current.loading);

    expect(result.current.error).toBe('Server unavailable');
    expect(result.current.rows).toHaveLength(0);
  });

  it('ignores stale responses when query changes quickly', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(fetchBookingListPage)
      .mockImplementationOnce(() => firstPromise as never)
      .mockResolvedValueOnce({
        data: [{ id: 'b-new', status: 'CONFIRMED' }],
        meta: {
          total: 1,
          page: 2,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
          nextCursor: null,
        },
      });

    const { result, rerender, unmount } = renderHook(
      (props: { tablePage: number }) =>
        useBookingsPlannerData({
          ...baseInput,
          tablePage: props.tablePage,
        }),
      { initialProps: { tablePage: 1 } },
    );
    unmountCurrent = unmount;

    rerender({ tablePage: 2 });
    await waitForHook(() => fetchBookingListPage.mock.calls.length >= 2);

    resolveFirst?.({
      data: [{ id: 'b-stale', status: 'CANCELLED' }],
      meta: {
        total: 99,
        page: 1,
        limit: 50,
        totalPages: 2,
        hasNextPage: true,
        nextCursor: null,
      },
    });

    await waitForHook(() => result.current.rows.some((row) => row.id === 'b-new'));

    expect(result.current.rows.some((row) => row.id === 'b-new')).toBe(true);
    expect(result.current.rows.some((row) => row.id === 'b-stale')).toBe(false);
  });
});

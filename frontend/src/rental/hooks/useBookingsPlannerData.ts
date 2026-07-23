import { useCallback, useEffect, useMemo, useState } from 'react';
import { mapApiBooking, type BookingUiRow } from '../rental/lib/entityMappers';
import type { BookingFiltersState, BookingPlannerView } from '../rental/components/bookings/bookingTypes';
import { statusFilterToApiStatuses } from '../rental/components/bookings/bookingQueryMappers';
import {
  fetchAllBookingsInRange,
  fetchBookingListPage,
  type BookingListMeta,
} from '../lib/bookings-pagination';

const TABLE_PAGE_SIZE = 50;
const RANGE_PAGE_SIZE = 100;

export interface UseBookingsPlannerDataInput {
  orgId: string | null | undefined;
  view: BookingPlannerView;
  filters: BookingFiltersState;
  timelineRange: 'week' | 'month';
  calendarMonth: number;
  calendarYear: number;
  tablePage: number;
}

export function useBookingsPlannerData({
  orgId,
  view,
  filters,
  timelineRange,
  calendarMonth,
  calendarYear,
  tablePage,
}: UseBookingsPlannerDataInput) {
  const [rows, setRows] = useState<BookingUiRow[]>([]);
  const [meta, setMeta] = useState<BookingListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleRange = useMemo(() => {
    if (view === 'calendar') {
      const start = new Date(calendarYear, calendarMonth, 1);
      const end = new Date(calendarYear, calendarMonth + 1, 1);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    const now = new Date();
    if (timelineRange === 'week') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [view, timelineRange, calendarMonth, calendarYear]);

  const apiParams = useMemo(() => {
    const statuses = statusFilterToApiStatuses(filters.status);
    return {
      search: filters.search.trim() || undefined,
      status: statuses?.join(','),
      vehicleId: filters.vehicleId ?? undefined,
      stationId: filters.stationId ?? undefined,
      customerId: undefined,
      from: filters.dateFrom ?? (view !== 'table' ? visibleRange.from : undefined),
      to: filters.dateTo ?? (view !== 'table' ? visibleRange.to : undefined),
      excludeTerminal: filters.showTerminal ? undefined : true,
      sortBy: 'startDate' as const,
      sortOrder: 'desc' as const,
    };
  }, [filters, view, visibleRange.from, visibleRange.to]);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setMeta(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (view === 'table') {
        const page = await fetchBookingListPage(orgId, {
          ...apiParams,
          page: tablePage,
          limit: TABLE_PAGE_SIZE,
        });
        setRows(page.data.map((row) => mapApiBooking(row)));
        setMeta(page.meta);
      } else {
        const vehicleIds = filters.vehicleId ? [filters.vehicleId] : undefined;
        const range = await fetchAllBookingsInRange(orgId, {
          ...apiParams,
          vehicleIds: vehicleIds?.join(','),
          vehicleId: undefined,
          limit: RANGE_PAGE_SIZE,
        });
        setRows(range.data.map((row) => mapApiBooking(row)));
        setMeta(range.meta);
      }
    } catch (err: unknown) {
      setRows([]);
      setMeta(null);
      setError(err instanceof Error ? err.message : 'Buchungen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [orgId, view, apiParams, tablePage, filters.vehicleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const truncated = Boolean(meta && meta.hasNextPage);

  return {
    rows,
    meta,
    loading,
    error,
    truncated,
    refresh,
    tablePageSize: TABLE_PAGE_SIZE,
  };
}

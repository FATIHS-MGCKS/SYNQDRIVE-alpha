import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapApiBooking, type BookingUiRow } from '../lib/entityMappers';
import type {
  BookingFiltersState,
  BookingPlannerView,
  BookingTableSortBy,
  BookingTableSortOrder,
} from '../components/bookings/bookingTypes';
import {
  fetchAllBookingsInRange,
  fetchBookingListPage,
  isAbortError,
  type BookingListMeta,
} from '../../lib/bookings-pagination';
import { buildBookingPlannerListParams } from '../../lib/bookings-query.utils';
import { BOOKINGS_LIST_INVALIDATED_EVENT } from '../lib/bookings-invalidation';
import {
  DEFAULT_ORG_TIMEZONE,
  orgCalendarMonthYear,
  zonedCalendarMonthRange,
  zonedWeekRange,
} from '../../lib/datetime';

const TABLE_PAGE_SIZE = 50;
const RANGE_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

export interface UseBookingsPlannerDataInput {
  orgId: string | null | undefined;
  timeZone?: string;
  view: BookingPlannerView;
  filters: BookingFiltersState;
  timelineRange: 'week' | 'month';
  calendarMonth: number;
  calendarYear: number;
  tablePage: number;
  sortBy: BookingTableSortBy;
  sortOrder: BookingTableSortOrder;
  refreshToken?: number;
}

export function useBookingsPlannerData({
  orgId,
  timeZone = DEFAULT_ORG_TIMEZONE,
  view,
  filters,
  timelineRange,
  calendarMonth,
  calendarYear,
  tablePage,
  sortBy,
  sortOrder,
  refreshToken = 0,
}: UseBookingsPlannerDataInput) {
  const [rows, setRows] = useState<BookingUiRow[]>([]);
  const [meta, setMeta] = useState<BookingListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const rowsRef = useRef<BookingUiRow[]>([]);

  rowsRef.current = rows;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const visibleRange = useMemo(() => {
    if (view === 'calendar') {
      return zonedCalendarMonthRange(calendarYear, calendarMonth, timeZone);
    }
    if (timelineRange === 'week') {
      return zonedWeekRange(new Date(), timeZone);
    }
    const { month, year } = orgCalendarMonthYear(timeZone);
    return zonedCalendarMonthRange(year, month, timeZone);
  }, [view, timelineRange, calendarMonth, calendarYear, timeZone]);

  const listParams = useMemo(
    () =>
      buildBookingPlannerListParams({
        filters,
        view,
        visibleRange,
        tablePage,
        tablePageSize: TABLE_PAGE_SIZE,
        sortBy,
        sortOrder,
        search: debouncedSearch,
      }),
    [filters, view, visibleRange, tablePage, sortBy, sortOrder, debouncedSearch],
  );

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    if (!orgId) {
      setRows([]);
      setMeta(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (rowsRef.current.length === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      if (view === 'table') {
        const page = await fetchBookingListPage(orgId, listParams, { signal: controller.signal });
        if (requestId !== requestIdRef.current) return;
        setRows(page.data.map((row) => mapApiBooking(row)));
        setMeta(page.meta);
      } else {
        const vehicleIds = filters.vehicleId ? [filters.vehicleId] : undefined;
        const range = await fetchAllBookingsInRange(
          orgId,
          {
            ...listParams,
            vehicleIds: vehicleIds?.join(','),
            vehicleId: undefined,
            limit: RANGE_PAGE_SIZE,
            page: undefined,
          },
          { signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;
        setRows(range.data.map((row) => mapApiBooking(row)));
        setMeta(range.meta);
      }
    } catch (err: unknown) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      setRows([]);
      setMeta(null);
      setError(err instanceof Error ? err.message : 'Buchungen konnten nicht geladen werden');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [orgId, view, listParams, filters.vehicleId]);

  useEffect(() => {
    void refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [refresh, refreshToken]);

  useEffect(() => {
    const onInvalidate = () => void refresh();
    const onHandover = () => void refresh();
    window.addEventListener(BOOKINGS_LIST_INVALIDATED_EVENT, onInvalidate);
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => {
      window.removeEventListener(BOOKINGS_LIST_INVALIDATED_EVENT, onInvalidate);
      window.removeEventListener('handover:completed', onHandover as EventListener);
    };
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

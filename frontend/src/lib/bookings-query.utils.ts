import type { BookingsListParams } from './api';
import type {
  BookingFiltersState,
  BookingPlannerView,
  BookingTableSortBy,
  BookingTableSortOrder,
} from '../rental/components/bookings/bookingTypes';
import { statusFilterToApiStatuses } from '../rental/components/bookings/bookingQueryMappers';

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function buildBookingPlannerListParams(input: {
  filters: BookingFiltersState;
  view: BookingPlannerView;
  visibleRange: { from: string; to: string };
  tablePage: number;
  tablePageSize: number;
  sortBy: BookingTableSortBy;
  sortOrder: BookingTableSortOrder;
  search: string;
}): BookingsListParams {
  const statuses = statusFilterToApiStatuses(input.filters.status);
  const trimmedSearch = input.search.trim();

  return {
    search: trimmedSearch || undefined,
    status: statuses?.join(','),
    vehicleId: input.filters.vehicleId ?? undefined,
    stationId: input.filters.stationId ?? undefined,
    from: input.filters.dateFrom ?? (input.view !== 'table' ? input.visibleRange.from : undefined),
    to: input.filters.dateTo ?? (input.view !== 'table' ? input.visibleRange.to : undefined),
    excludeTerminal: input.filters.showTerminal ? undefined : true,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    page: input.view === 'table' ? input.tablePage : undefined,
    limit: input.view === 'table' ? input.tablePageSize : undefined,
  };
}

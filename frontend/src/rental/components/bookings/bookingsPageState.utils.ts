import type { BookingFiltersState } from './bookingTypes';

export type BookingsPlannerEmptyVariant = 'none' | 'dataset' | 'filter';

export function hasActiveBookingPlannerFilters(filters: BookingFiltersState): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.vehicleId != null ||
    filters.stationId != null ||
    filters.dateFrom != null ||
    filters.dateTo != null ||
    filters.showTerminal
  );
}

export function bookingsPlannerInitialLoading(input: {
  loading: boolean;
  hasCachedBookings: boolean;
}): boolean {
  return input.loading && !input.hasCachedBookings;
}

export function bookingsPlannerFatalError(input: {
  error: string | null;
  hasCachedBookings: boolean;
}): boolean {
  return Boolean(input.error) && !input.hasCachedBookings;
}

export function bookingsPlannerPartialError(input: {
  error: string | null;
  hasCachedBookings: boolean;
}): boolean {
  return Boolean(input.error) && input.hasCachedBookings;
}

export function bookingsPlannerEmptyVariant(input: {
  loading: boolean;
  error: string | null;
  totalCount: number;
  filteredCount: number;
}): BookingsPlannerEmptyVariant {
  if (input.loading || input.error) return 'none';
  if (input.filteredCount > 0) return 'none';
  if (input.totalCount === 0) return 'dataset';
  return 'filter';
}

export function bookingsPlannerShowViews(input: {
  initialLoading: boolean;
  fatalError: boolean;
  filteredCount: number;
}): boolean {
  return !input.initialLoading && !input.fatalError && input.filteredCount > 0;
}
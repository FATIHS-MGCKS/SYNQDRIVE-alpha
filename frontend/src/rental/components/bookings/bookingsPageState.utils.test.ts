import { describe, expect, it } from 'vitest';
import type { BookingFiltersState } from './bookingTypes';
import {
  bookingsPlannerEmptyVariant,
  bookingsPlannerFatalError,
  bookingsPlannerInitialLoading,
  bookingsPlannerPartialError,
  bookingsPlannerShowViews,
  hasActiveBookingPlannerFilters,
} from './bookingsPageState.utils';

const defaultFilters: BookingFiltersState = {
  search: '',
  status: 'all',
  vehicleId: null,
  stationId: null,
  dateFrom: null,
  dateTo: null,
  showTerminal: false,
};

describe('bookingsPageState.utils', () => {
  it('detects active planner filters', () => {
    expect(hasActiveBookingPlannerFilters(defaultFilters)).toBe(false);
    expect(hasActiveBookingPlannerFilters({ ...defaultFilters, search: 'Müller' })).toBe(true);
    expect(hasActiveBookingPlannerFilters({ ...defaultFilters, status: 'active' })).toBe(true);
    expect(hasActiveBookingPlannerFilters({ ...defaultFilters, showTerminal: true })).toBe(true);
  });

  it('distinguishes initial loading from background refresh semantics', () => {
    expect(bookingsPlannerInitialLoading({ loading: true, hasCachedBookings: false })).toBe(true);
    expect(bookingsPlannerInitialLoading({ loading: true, hasCachedBookings: true })).toBe(false);
    expect(bookingsPlannerInitialLoading({ loading: false, hasCachedBookings: false })).toBe(false);
  });

  it('splits fatal vs partial API errors', () => {
    expect(bookingsPlannerFatalError({ error: 'Netz', hasCachedBookings: false })).toBe(true);
    expect(bookingsPlannerFatalError({ error: 'Netz', hasCachedBookings: true })).toBe(false);
    expect(bookingsPlannerPartialError({ error: 'Netz', hasCachedBookings: true })).toBe(true);
    expect(bookingsPlannerPartialError({ error: null, hasCachedBookings: true })).toBe(false);
  });

  it('classifies empty dataset vs empty filter', () => {
    expect(
      bookingsPlannerEmptyVariant({
        loading: false,
        error: null,
        totalCount: 0,
        filteredCount: 0,
      }),
    ).toBe('dataset');
    expect(
      bookingsPlannerEmptyVariant({
        loading: false,
        error: null,
        totalCount: 3,
        filteredCount: 0,
      }),
    ).toBe('filter');
    expect(
      bookingsPlannerEmptyVariant({
        loading: false,
        error: null,
        totalCount: 2,
        filteredCount: 2,
      }),
    ).toBe('none');
    expect(
      bookingsPlannerEmptyVariant({
        loading: true,
        error: null,
        totalCount: 0,
        filteredCount: 0,
      }),
    ).toBe('none');
  });

  it('shows views only when data is renderable', () => {
    expect(
      bookingsPlannerShowViews({ initialLoading: false, fatalError: false, filteredCount: 1 }),
    ).toBe(true);
    expect(
      bookingsPlannerShowViews({ initialLoading: true, fatalError: false, filteredCount: 0 }),
    ).toBe(false);
    expect(
      bookingsPlannerShowViews({ initialLoading: false, fatalError: true, filteredCount: 0 }),
    ).toBe(false);
  });
});
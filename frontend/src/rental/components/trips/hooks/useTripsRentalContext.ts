import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type BookingDetailDto } from '../../../../lib/api';
import { unwrapBookingListResponse } from '../../bookings/bookingUtils';
import type { TripData } from '../trips.types';
import {
  bookingRefFromListRow,
  buildTripRentalContextView,
  type TripBookingRef,
  type TripRentalContextView,
} from '../utils/tripRentalContext';
import { localDayRangeIso } from '../utils/tripTimeline';
import { useRequestGuard } from './useRequestGuard';

interface UseTripsRentalContextOptions {
  orgId?: string;
  vehicleId?: string;
  selectedDate?: string;
  trips: TripData[];
  selectedTripId: string | null;
}

export function useTripsRentalContext({
  orgId,
  vehicleId,
  selectedDate,
  trips,
  selectedTripId,
}: UseTripsRentalContextOptions) {
  const [bookings, setBookings] = useState<TripBookingRef[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [bookingDetails, setBookingDetails] = useState<Record<string, BookingDetailDto>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const loadedDetailRef = useRef<Set<string>>(new Set());
  const guard = useRequestGuard();

  const loadBookings = useCallback(async () => {
    if (!orgId || !vehicleId) {
      setBookings([]);
      return;
    }
    const seq = guard.next();
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const range = selectedDate
        ? localDayRangeIso(selectedDate)
        : trips.length > 0
          ? {
              from: trips.reduce((min, t) => (t.startTime < min ? t.startTime : min), trips[0].startTime),
              to: trips.reduce((max, t) => {
                const end = t.endTime ?? t.startTime;
                return end > max ? end : max;
              }, trips[0].endTime ?? trips[0].startTime),
            }
          : null;

      const res = await api.bookings.list(orgId, {
        vehicleId,
        from: range?.from,
        to: range?.to,
        limit: 200,
      });
      if (!guard.isCurrent(seq)) return;

      const rows = unwrapBookingListResponse(res);
      const parsed = rows
        .map((row) => bookingRefFromListRow(row as Record<string, unknown>))
        .filter((b): b is TripBookingRef => b != null);
      setBookings(parsed);
    } catch {
      if (!guard.isCurrent(seq)) return;
      setBookingsError('Buchungen konnten nicht geladen werden.');
      setBookings([]);
    }
    if (guard.isCurrent(seq)) setBookingsLoading(false);
  }, [orgId, vehicleId, selectedDate, trips, guard]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const loadBookingDetail = useCallback(
    async (bookingId: string) => {
      if (!orgId || loadedDetailRef.current.has(bookingId)) return;
      const seq = guard.next();
      setDetailLoadingId(bookingId);
      try {
        const detail = await api.bookings.detail(orgId, bookingId);
        if (!guard.isCurrent(seq)) return;
        loadedDetailRef.current.add(bookingId);
        setBookingDetails((prev) => ({ ...prev, [bookingId]: detail }));
      } catch {
        if (!guard.isCurrent(seq)) return;
      }
      if (guard.isCurrent(seq)) setDetailLoadingId(null);
    },
    [orgId, guard],
  );

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId],
  );

  useEffect(() => {
    if (!selectedTrip || !orgId) return;
    const bookingId =
      selectedTrip.assignedBookingId ??
      buildTripRentalContextView(selectedTrip, trips, bookings, bookingDetails).booking?.id;
    if (bookingId) void loadBookingDetail(bookingId);
  }, [selectedTrip, orgId, trips, bookings, bookingDetails, loadBookingDetail]);

  const tripsByDay = useMemo(() => {
    const map = new Map<string, TripData[]>();
    for (const trip of trips) {
      const key = trip.startTime.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(trip);
      map.set(key, list);
    }
    return map;
  }, [trips]);

  const contextByTripId = useMemo(() => {
    const map = new Map<string, TripRentalContextView>();
    for (const trip of trips) {
      const dayKey = trip.startTime.slice(0, 10);
      const dayTrips = tripsByDay.get(dayKey) ?? [trip];
      map.set(trip.id, buildTripRentalContextView(trip, dayTrips, bookings, bookingDetails));
    }
    return map;
  }, [trips, tripsByDay, bookings, bookingDetails]);

  const selectedContext = selectedTripId ? contextByTripId.get(selectedTripId) ?? null : null;

  const unlinkedTripCount = useMemo(
    () =>
      trips.filter(
        (t) =>
          !t.assignedBookingId &&
          t.assignmentStatus !== 'ASSIGNED_BOOKING_CUSTOMER' &&
          t.tripStatus === 'COMPLETED' &&
          !t.isPrivateTrip,
      ).length,
    [trips],
  );

  return {
    bookings,
    bookingsLoading,
    bookingsError,
    bookingDetails,
    detailLoadingId,
    contextByTripId,
    selectedContext,
    unlinkedTripCount,
    reloadBookings: loadBookings,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { api, type VehicleTripAnalytics } from '../../../lib/api';
import { unwrapBookingListResponse } from '../bookings/bookingUtils';
import {
  bookingRefFromListRow,
  type TripBookingRef,
} from '../trips/utils/tripRentalContext';
import { useRequestGuard } from '../trips/hooks/useRequestGuard';

const CONTEXT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

interface UseTelltaleDetailContextOptions {
  orgId?: string;
  vehicleId?: string;
  enabled: boolean;
}

export function useTelltaleDetailContext({
  orgId,
  vehicleId,
  enabled,
}: UseTelltaleDetailContextOptions) {
  const [bookings, setBookings] = useState<TripBookingRef[]>([]);
  const [trips, setTrips] = useState<VehicleTripAnalytics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRequestGuard();

  const load = useCallback(async () => {
    if (!enabled || !orgId || !vehicleId) {
      setBookings([]);
      setTrips([]);
      return;
    }
    const seq = guard.next();
    setLoading(true);
    setError(null);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - CONTEXT_LOOKBACK_MS).toISOString();
    try {
      const [bookingRes, tripRes] = await Promise.all([
        api.bookings.list(orgId, { vehicleId, from, to, limit: 200 }),
        api.vehicleIntelligence.trips(vehicleId, { from, to }),
      ]);
      if (!guard.isCurrent(seq)) return;
      const rows = unwrapBookingListResponse(bookingRes);
      const parsed = rows
        .map((row) => bookingRefFromListRow(row as Record<string, unknown>))
        .filter((b): b is TripBookingRef => b != null);
      setBookings(parsed);
      setTrips(Array.isArray(tripRes) ? tripRes : []);
    } catch {
      if (!guard.isCurrent(seq)) return;
      setError('Buchungs- und Fahrtkontext konnten nicht geladen werden.');
      setBookings([]);
      setTrips([]);
    }
    if (guard.isCurrent(seq)) setLoading(false);
  }, [enabled, orgId, vehicleId, guard]);

  useEffect(() => {
    void load();
  }, [load]);

  return { bookings, trips, loading, error };
}

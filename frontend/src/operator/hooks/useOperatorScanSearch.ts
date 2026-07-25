import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import {
  isOperatorOperationalTodayRow,
  mapBookingListRowToTodayRow,
} from '../../rental/lib/today-booking-contract';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import { useOperatorVehiclesData } from './useOperatorVehiclesData';
import { isUuidLike } from '../lib/operatorRoutes';

export interface OperatorScanBookingHit {
  bookingId: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  customerName: string;
  status: string;
  statusEnum?: string;
  startDate?: string;
  endDate?: string;
  pickupProtocol?: unknown;
  returnProtocol?: unknown;
  isOverdue?: boolean;
  pickupStationName?: string;
  returnStationName?: string;
  pickupStationId?: string;
  returnStationId?: string;
  stationLabel?: string;
  station?: string;
  /** Canonical today row when mapped from list/get API. */
  todayRow?: TodayBookingApiRow;
}

function mapBookingRow(row: unknown): OperatorScanBookingHit | null {
  const todayRow = mapBookingListRowToTodayRow(row);
  if (!todayRow?.id) return null;

  const { vehicleName, plate } = (() => {
    const name = todayRow.vehicleName ?? '';
    const license = todayRow.vehicleLicense ?? '';
    return {
      vehicleName: name,
      plate: license,
    };
  })();

  return {
    bookingId: todayRow.id,
    vehicleId: todayRow.vehicleId ?? '',
    vehicleName,
    plate,
    customerName: todayRow.customerName ?? '',
    status: todayRow.status ?? '',
    statusEnum: todayRow.statusEnum,
    startDate: todayRow.startDate,
    endDate: todayRow.endDate,
    pickupProtocol: todayRow.pickupProtocol,
    returnProtocol: todayRow.returnProtocol,
    isOverdue: todayRow.isOverdue,
    pickupStationName: todayRow.pickupStationName,
    returnStationName: todayRow.returnStationName,
    pickupStationId: todayRow.pickupStationId,
    returnStationId: todayRow.returnStationId,
    stationLabel: todayRow.stationLabel,
    station: todayRow.station,
    todayRow,
  };
}

export function useOperatorScanSearch(
  query: string,
  focusedBookingId: string | null,
  refreshToken = 0,
) {
  const { orgId } = useRentalOrg();
  const trimmed = query.trim();
  const { vehicles, vehicleById, healthMap, loading: fleetLoading } = useOperatorVehiclesData(trimmed);

  const [bookings, setBookings] = useState<OperatorScanBookingHit[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [focusedBooking, setFocusedBooking] = useState<OperatorScanBookingHit | null>(null);
  const [focusedLoading, setFocusedLoading] = useState(false);

  useEffect(() => {
    if (!orgId || trimmed.length < 2) {
      setBookings([]);
      setBookingsError(null);
      setBookingsLoading(false);
      return;
    }

    let cancelled = false;
    setBookingsLoading(true);
    setBookingsError(null);

    const run = async () => {
      try {
        const hits: OperatorScanBookingHit[] = [];
        const directLookup = isUuidLike(trimmed);

        if (directLookup) {
          try {
            const direct = await api.bookings.get(orgId, trimmed);
            const mapped = mapBookingRow(direct);
            if (mapped) hits.push(mapped);
          } catch {
            /* fall through to list search */
          }
        }

        const listRes = await api.bookings.list(orgId, { search: trimmed, limit: 12 });
        const rows = Array.isArray(listRes)
          ? listRes
          : listRes && typeof listRes === 'object' && Array.isArray((listRes as { data?: unknown }).data)
            ? (listRes as { data: unknown[] }).data
            : [];

        for (const row of rows) {
          const mapped = mapBookingRow(row);
          if (!mapped || hits.some((h) => h.bookingId === mapped.bookingId)) continue;
          if (!directLookup && mapped.todayRow && !isOperatorOperationalTodayRow(mapped.todayRow)) {
            continue;
          }
          hits.push(mapped);
        }

        if (!cancelled) setBookings(hits);
      } catch (e) {
        if (!cancelled) {
          setBookings([]);
          setBookingsError(e instanceof Error ? e.message : 'Buchungssuche fehlgeschlagen');
        }
      } finally {
        if (!cancelled) setBookingsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [orgId, trimmed, refreshToken]);

  useEffect(() => {
    if (!orgId || !focusedBookingId) {
      setFocusedBooking(null);
      setFocusedLoading(false);
      return;
    }

    let cancelled = false;
    setFocusedLoading(true);
    api.bookings
      .get(orgId, focusedBookingId)
      .then((row) => {
        if (!cancelled) setFocusedBooking(mapBookingRow(row));
      })
      .catch(() => {
        if (!cancelled) setFocusedBooking(null);
      })
      .finally(() => {
        if (!cancelled) setFocusedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, focusedBookingId, refreshToken]);

  const bookingHits = useMemo(() => {
    const merged = [...bookings];
    if (focusedBooking && !merged.some((b) => b.bookingId === focusedBooking.bookingId)) {
      merged.unshift(focusedBooking);
    }
    return merged;
  }, [bookings, focusedBooking]);

  const loading = fleetLoading || bookingsLoading || focusedLoading;
  const hasQuery = trimmed.length > 0 || Boolean(focusedBookingId);

  return {
    vehicles,
    vehicleById,
    healthMap,
    bookings: bookingHits,
    focusedBooking,
    loading,
    bookingsError,
    hasQuery,
  };
}

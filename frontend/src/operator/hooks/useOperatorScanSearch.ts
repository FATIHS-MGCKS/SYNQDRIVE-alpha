import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
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
}

function normalizeBookingRows(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function mapBookingRow(row: Record<string, unknown>): OperatorScanBookingHit | null {
  const bookingId = String(row.id ?? row.bookingId ?? '');
  if (!bookingId) return null;
  return {
    bookingId,
    vehicleId: String(row.vehicleId ?? ''),
    vehicleName: String(row.vehicleName ?? row.vehicleModel ?? '—'),
    plate: String(row.vehicleLicense ?? row.licensePlate ?? row.plate ?? ''),
    customerName: String(row.customerName ?? '—'),
    status: String(row.status ?? '—'),
    statusEnum: row.statusEnum ? String(row.statusEnum) : undefined,
    startDate: row.startDate ? String(row.startDate) : undefined,
    endDate: row.endDate ? String(row.endDate) : undefined,
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
        if (isUuidLike(trimmed)) {
          try {
            const direct = await api.bookings.get(orgId, trimmed);
            const mapped = mapBookingRow(direct as Record<string, unknown>);
            if (mapped) hits.push(mapped);
          } catch {
            /* fall through to list search */
          }
        }
        const listRes = await api.bookings.list(orgId, { search: trimmed, limit: 12 });
        const rows = normalizeBookingRows(listRes);
        for (const row of rows) {
          const mapped = mapBookingRow(row);
          if (mapped && !hits.some((h) => h.bookingId === mapped.bookingId)) {
            hits.push(mapped);
          }
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
        if (!cancelled) setFocusedBooking(mapBookingRow(row as Record<string, unknown>));
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

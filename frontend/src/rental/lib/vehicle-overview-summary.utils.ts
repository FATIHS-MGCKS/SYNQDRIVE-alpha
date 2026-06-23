import type { ApiTask, VehicleTripAnalytics, VehicleTripStats } from '../../lib/api';
import type { EffectiveHealthStatus } from '../FleetContext';
import type { VehicleData } from '../data/vehicles';
import { normalizeBookingStatus } from '../components/bookings/bookingStatus';
import type { DamageStatsResponse } from './damage.types';
import { parseVehicleTaskList, type VehicleTaskRow } from './task-display.utils';
import type { VehicleBookingHorizon, VehicleBookingOperatorInput } from './vehicle-booking-operator.utils';
import type { VehicleFileSummary } from './vehicle-file-summary.types';
import { buildOverviewCards } from './vehicle-overview-cards.utils';
import { deriveVehicleOverviewReadiness } from './vehicle-overview-readiness.utils';
import type {
  VehicleOverviewHealthSnapshot,
  VehicleOverviewLocationSnapshot,
  VehicleOverviewSummary,
} from './vehicle-overview.types';

const MS_DAY = 24 * 60 * 60 * 1000;
const OVERVIEW_BOOKINGS_PAST_DAYS = 7;
const OVERVIEW_BOOKINGS_FUTURE_DAYS = 30;

const EMPTY_LOCATION: VehicleOverviewLocationSnapshot = {
  displayState: null,
  onlineStatus: null,
  lastSignal: null,
  hasPosition: false,
};

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

export function buildOverviewBookingsHorizon(now = Date.now()): VehicleBookingHorizon {
  const start = new Date(now - OVERVIEW_BOOKINGS_PAST_DAYS * MS_DAY);
  const end = new Date(now + OVERVIEW_BOOKINGS_FUTURE_DAYS * MS_DAY);
  return {
    start,
    end,
    totalMs: end.getTime() - start.getTime(),
  };
}

export function buildOverviewBookingsQueryRange(now = Date.now()): { from: string; to: string } {
  const horizon = buildOverviewBookingsHorizon(now);
  return {
    from: horizon.start.toISOString(),
    to: horizon.end.toISOString(),
  };
}

/** Lightweight parser shared by overview summary and booking quick cards. */
export function parseVehicleBookingOperatorRow(
  raw: Record<string, unknown>,
): VehicleBookingOperatorInput | null {
  const start = parseDate(raw.startDate ?? raw.pickupAt ?? raw.startAt);
  const end = parseDate(raw.endDate ?? raw.returnAt ?? raw.endAt);
  if (!start || !end) return null;

  const status = normalizeBookingStatus(
    raw.statusEnum as string | undefined,
    raw.status as string | undefined,
  );

  return {
    id: String(raw.id ?? ''),
    customerName: String(
      raw.customerName ??
        (raw.customer as { name?: string } | undefined)?.name ??
        'Unbekannter Kunde',
    ),
    status,
    startDate: start,
    endDate: end,
    pickupLocation: String(
      raw.pickupLocation ??
        raw.pickupStationName ??
        (raw.pickupStation as { name?: string } | undefined)?.name ??
        'Abholung offen',
    ),
    returnLocation: String(
      raw.returnLocation ??
        raw.returnStationName ??
        (raw.returnStation as { name?: string } | undefined)?.name ??
        'Rückgabe offen',
    ),
    totalPriceCents:
      typeof raw.totalPriceCents === 'number' && Number.isFinite(raw.totalPriceCents)
        ? raw.totalPriceCents
        : null,
  };
}

export function parseVehicleBookingOperatorList(rows: unknown): VehicleBookingOperatorInput[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) =>
      row && typeof row === 'object'
        ? parseVehicleBookingOperatorRow(row as Record<string, unknown>)
        : null,
    )
    .filter((row): row is VehicleBookingOperatorInput => row != null);
}

export function deriveLocationOverviewSnapshot(input?: {
  displayState?: string | null;
  onlineStatus?: string | null;
  lastSignal?: string | null;
  hasPosition?: boolean;
}): VehicleOverviewLocationSnapshot {
  if (!input) return EMPTY_LOCATION;
  return {
    displayState: input.displayState ?? null,
    onlineStatus: input.onlineStatus ?? null,
    lastSignal: input.lastSignal ?? null,
    hasPosition: input.hasPosition === true,
  };
}

export function deriveHealthOverviewSnapshot(input: {
  effectiveStatus: EffectiveHealthStatus;
  rentalBlocked?: boolean;
  blockingReasons?: string[];
  loading?: boolean;
}): VehicleOverviewHealthSnapshot {
  return {
    effectiveStatus: input.effectiveStatus,
    rentalBlocked: input.rentalBlocked === true,
    blockingReasons: input.blockingReasons ?? [],
    loadState: input.loading ? 'loading' : 'ready',
  };
}

export function buildVehicleOverviewSummary(input: {
  vehicle: VehicleData | null;
  effectiveStatus: EffectiveHealthStatus;
  healthLoading?: boolean;
  rentalBlocked?: boolean;
  blockingReasons?: string[];
  location?: VehicleOverviewLocationSnapshot;
  bookings: VehicleBookingOperatorInput[];
  bookingsLoading?: boolean;
  bookingsError?: boolean;
  tasks: VehicleTaskRow[];
  rawTasks?: ApiTask[];
  tasksLoading?: boolean;
  tasksError?: boolean;
  damageStats: DamageStatsResponse | null;
  damagesLoading?: boolean;
  damagesError?: boolean;
  damagesUnavailable?: boolean;
  fileSummary: VehicleFileSummary | null;
  documentsLoading?: boolean;
  documentsError?: boolean;
  todayTrips: VehicleTripAnalytics[];
  tripStats: VehicleTripStats | null;
  tripsLoading?: boolean;
  tripsError?: boolean;
  tripsUnavailable?: boolean;
  now?: number;
}): VehicleOverviewSummary {
  const health = deriveHealthOverviewSnapshot({
    effectiveStatus: input.effectiveStatus,
    rentalBlocked: input.rentalBlocked,
    blockingReasons: input.blockingReasons,
    loading: input.healthLoading,
  });

  const cards = buildOverviewCards({
    todayTrips: input.todayTrips,
    tripStats: input.tripStats,
    tripsLoading: input.tripsLoading,
    tripsError: input.tripsError,
    tripsUnavailable: input.tripsUnavailable,
    bookings: input.bookings,
    vehicle: input.vehicle,
    bookingsLoading: input.bookingsLoading,
    bookingsError: input.bookingsError,
    tasks: input.tasks,
    rawTasks: input.rawTasks,
    tasksLoading: input.tasksLoading,
    tasksError: input.tasksError,
    damageStats: input.damageStats,
    damagesLoading: input.damagesLoading,
    damagesError: input.damagesError,
    damagesUnavailable: input.damagesUnavailable,
    fileSummary: input.fileSummary,
    documentsLoading: input.documentsLoading,
    documentsError: input.documentsError,
    now: input.now,
  });

  const readiness = deriveVehicleOverviewReadiness({ health, cards });

  const isLoading =
    health.loadState === 'loading' ||
    cards.trips.loadState === 'loading' ||
    cards.bookings.loadState === 'loading' ||
    cards.tasks.loadState === 'loading' ||
    cards.damages.loadState === 'loading' ||
    cards.documents.loadState === 'loading';

  return {
    vehicleId: input.vehicle?.id ?? null,
    vehicle: input.vehicle,
    location: input.location ?? EMPTY_LOCATION,
    health,
    cards,
    readiness,
    isLoading,
  };
}

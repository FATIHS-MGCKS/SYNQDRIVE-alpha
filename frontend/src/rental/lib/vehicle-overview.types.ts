import type { EffectiveHealthStatus } from '../FleetContext';
import type { VehicleData } from '../data/vehicles';

/** Vehicle detail tabs — keep in sync with `VEHICLE_DETAIL_VIEWS` in `rental/App.tsx`. */
export type VehicleDetailTab =
  | 'overview'
  | 'trips'
  | 'health-errors'
  | 'damages'
  | 'documents'
  | 'vehicle-bookings'
  | 'vehicle-tasks'
  | 'vehicle-requirements';

export type VehicleOverviewQuickCardId =
  | 'trips'
  | 'bookings'
  | 'tasks'
  | 'damages'
  | 'documents';

/** Card-level status for quick-card accents. */
export type VehicleOverviewCardStatus =
  | 'clear'
  | 'attention'
  | 'critical'
  | 'neutral'
  | 'active';

export type VehicleOverviewLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export type VehicleOverviewReadinessStatus = 'ready' | 'attention' | 'blocked' | 'unknown';

export type VehicleOverviewReadinessTone = 'clear' | 'attention' | 'critical' | 'neutral';

export interface VehicleOverviewCardBase {
  id: VehicleOverviewQuickCardId;
  title: string;
  headline: string;
  subline?: string;
  status: VehicleOverviewCardStatus;
  loadState: VehicleOverviewLoadState;
  targetTab: VehicleDetailTab;
}

export interface VehicleOverviewTripsCardSummary extends VehicleOverviewCardBase {
  id: 'trips';
  lastTripLabel: string;
  todayDistanceLabel?: string;
  eventCountLabel?: string;
  targetTab: 'trips';
}

export interface VehicleOverviewBookingsCardSummary extends VehicleOverviewCardBase {
  id: 'bookings';
  activeBookingLabel?: string;
  nextBookingLabel?: string;
  dueLabel?: string;
  isOverdue: boolean;
  targetTab: 'vehicle-bookings';
}

export interface VehicleOverviewTasksCardSummary extends VehicleOverviewCardBase {
  id: 'tasks';
  openCount: number;
  criticalCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  blockingCount: number;
  topTaskSubline?: string;
  targetTab: 'vehicle-tasks';
}

export interface VehicleOverviewDamagesCardSummary extends VehicleOverviewCardBase {
  id: 'damages';
  openCount: number;
  blockingCount: number;
  safetyCriticalCount: number;
  latestStatusLabel?: string;
  targetTab: 'damages';
}

export interface VehicleOverviewDocumentsCardSummary extends VehicleOverviewCardBase {
  id: 'documents';
  missingCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  needsReviewCount: number;
  trackingLabel: string;
  targetTab: 'documents';
}

export interface VehicleOverviewReadinessSummary {
  readinessStatus: VehicleOverviewReadinessStatus;
  title: string;
  subtitle: string;
  blockers: string[];
  /** Full blocker count before UI truncation (for "+X more"). */
  totalBlockerCount: number;
  tone: VehicleOverviewReadinessTone;
  loadState: VehicleOverviewLoadState;
}

export interface VehicleOverviewCards {
  trips: VehicleOverviewTripsCardSummary;
  bookings: VehicleOverviewBookingsCardSummary;
  tasks: VehicleOverviewTasksCardSummary;
  damages: VehicleOverviewDamagesCardSummary;
  documents: VehicleOverviewDocumentsCardSummary;
}

/**
 * Derived from `useVehicleLiveMapStore` in the presentation layer — not fetched
 * by `useVehicleOverviewSummary` (map card already owns live telemetry).
 */
export interface VehicleOverviewLocationSnapshot {
  displayState: string | null;
  onlineStatus: string | null;
  lastSignal: string | null;
  hasPosition: boolean;
}

export interface VehicleOverviewHealthSnapshot {
  effectiveStatus: EffectiveHealthStatus;
  rentalBlocked: boolean;
  blockingReasons: string[];
  loadState: VehicleOverviewLoadState;
}

export interface VehicleOverviewSummary {
  vehicleId: string | null;
  vehicle: VehicleData | null;
  location: VehicleOverviewLocationSnapshot;
  health: VehicleOverviewHealthSnapshot;
  cards: VehicleOverviewCards;
  readiness: VehicleOverviewReadinessSummary;
  isLoading: boolean;
}

import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import { resolveTelemetryFreshness } from '../../lib/telemetryFreshness';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { Station } from '../../../lib/api';
import type {
  DataFreshnessSummary,
  DataSyncStatus,
  FleetReadinessBreakdown,
  FleetReadinessStatus,
  FleetReadinessSummary,
  StationHealthSummary,
  TodayBookingApiRow,
  StationDataFreshness,
} from './dashboardTypes';
import { countReadyToRent, deriveDataSyncStatus, formatLastSyncLabel, isVehicleReadyToRent } from './dashboardUtils';

export type VehicleTelemetryBucket = 'fresh' | 'stale' | 'offline' | 'unknown';

export interface VehicleTelemetryFreshness {
  totalInScope: number;
  freshCount: number;
  staleCount: number;
  offlineCount: number;
  unknownCount: number;
  hasReliableTimestamps: boolean;
  syncStatus: DataSyncStatus;
  lastRefreshLabel: string;
  telemetryUnavailable: boolean;
}

function classifyTelemetry(v: VehicleData): VehicleTelemetryBucket {
  // Central 5-state freshness. STANDBY counts as fresh (normal quiet state);
  // only soft-offline (signal_delayed, 24–48h) is "stale", and real offline /
  // never-reported map to offline / unknown.
  const f = resolveTelemetryFreshness(v);
  if (f.isOffline) return 'offline';
  if (f.isNoSignal) return 'unknown';
  if (f.isSignalDelayed) return 'stale';
  return 'fresh';
}

export function computeVehicleTelemetryFreshness(input: {
  vehicles: VehicleData[];
  dataFreshness: DataFreshnessSummary;
  orgActive: boolean;
  locale: string;
  lastManualSyncAt: string | null;
}): VehicleTelemetryFreshness {
  const buckets: Record<VehicleTelemetryBucket, number> = {
    fresh: 0,
    stale: 0,
    offline: 0,
    unknown: 0,
  };

  for (const v of input.vehicles) {
    buckets[classifyTelemetry(v)] += 1;
  }

  const hasReliableTimestamps = input.vehicles.some((v) => !!v.lastSignal);
  const telemetryUnavailable = input.vehicles.length > 0 && !hasReliableTimestamps;

  let syncStatus = deriveDataSyncStatus(input.dataFreshness, input.orgActive);
  if (telemetryUnavailable && syncStatus === 'live') syncStatus = 'partial';
  if (
    input.vehicles.length > 0 &&
    hasReliableTimestamps &&
    buckets.offline + buckets.unknown > buckets.fresh
  ) {
    if (syncStatus === 'live') syncStatus = 'partial';
  }
  if (buckets.stale > buckets.fresh && buckets.fresh === 0 && hasReliableTimestamps) {
    if (syncStatus === 'live') syncStatus = 'stale';
  }

  return {
    totalInScope: input.vehicles.length,
    freshCount: buckets.fresh,
    staleCount: buckets.stale,
    offlineCount: buckets.offline,
    unknownCount: buckets.unknown,
    hasReliableTimestamps,
    syncStatus,
    lastRefreshLabel: formatLastSyncLabel(
      input.dataFreshness.insightsGeneratedAt,
      input.lastManualSyncAt,
      input.locale,
    ),
    telemetryUnavailable,
  };
}

function statusLabel(status: FleetReadinessStatus, locale: string): string {
  const de = locale === 'de';
  const map: Record<FleetReadinessStatus, [string, string]> = {
    strong: ['Strong', 'Stark'],
    stable: ['Stable', 'Stabil'],
    'needs-attention': ['Needs attention', 'Braucht Aufmerksamkeit'],
    critical: ['Critical', 'Kritisch'],
    'not-enough-data': ['Not enough data', 'Zu wenig Daten'],
  };
  return de ? map[status][1] : map[status][0];
}

function isBlockedVehicle(
  v: VehicleData,
  healthMap: Map<string, VehicleHealthResponse>,
): boolean {
  if (v.status === 'Maintenance') return true;
  const h = healthMap.get(v.id);
  return h?.rental_blocked === true;
}

function countConflicts(
  vehicles: VehicleData[],
  healthMap: Map<string, VehicleHealthResponse>,
): number {
  let n = 0;
  for (const v of vehicles) {
    if (v.reservedIsOverdue) n += 1;
    else if (v.status === 'Reserved' && isBlockedVehicle(v, healthMap)) n += 1;
  }
  return n;
}

export function computeFleetReadiness(input: {
  vehicles: VehicleData[];
  availableVehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  healthAlerts: VehicleHealthAlert[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  telemetry: VehicleTelemetryFreshness;
  locale: string;
  fleetLoading: boolean;
  readyOptions?: import('./dashboardUtils').ReadyToRentOptions;
}): FleetReadinessSummary {
  const scopedAlertIds = new Set(input.vehicles.map((v) => v.id));
  const criticalAlerts = input.healthAlerts.filter(
    (a) => a.severity === 'critical' && scopedAlertIds.has(a.vehicleId),
  ).length;

  const ready = countReadyToRent(input.availableVehicles, input.readyOptions);
  const blocked = input.vehicles.filter((v) => isBlockedVehicle(v, input.healthMap)).length;
  const overdueFromReturns = input.returnItems.filter((r) => r.isOverdue && !r.done).length;
  const returnBookingIds = new Set(
    input.returnItems.map((r) => r.bookingId).filter(Boolean),
  );
  let overdueFromFleet = 0;
  for (const v of input.vehicles) {
    if (v.activeIsOverdue && v.activeBookingId && !returnBookingIds.has(v.activeBookingId)) {
      overdueFromFleet += 1;
    }
  }
  const overdueReturns = overdueFromReturns + overdueFromFleet;
  const cleaningNeeded = input.vehicles.filter(
    (v) => v.cleaningStatus !== 'Clean' && (v.status === 'Available' || v.status === 'Reserved'),
  ).length;
  const staleData = input.telemetry.staleCount + input.telemetry.offlineCount;
  const conflicts = countConflicts(input.vehicles, input.healthMap);

  const breakdown: FleetReadinessBreakdown = {
    ready,
    blocked,
    overdueReturns,
    criticalAlerts,
    cleaningNeeded,
    staleData,
    conflicts,
  };

  if (input.fleetLoading) {
    return {
      status: 'not-enough-data',
      statusLabel: statusLabel('not-enough-data', input.locale),
      scorePercent: null,
      breakdown,
      hasReliableBasis: false,
    };
  }

  if (input.vehicles.length === 0) {
    return {
      status: 'not-enough-data',
      statusLabel: statusLabel('not-enough-data', input.locale),
      scorePercent: null,
      breakdown,
      hasReliableBasis: false,
    };
  }

  const negativeScore =
    blocked * 2 +
    criticalAlerts * 3 +
    overdueReturns * 3 +
    cleaningNeeded +
    conflicts * 2 +
    Math.floor(staleData / 2);

  let status: FleetReadinessStatus = 'stable';
  if (criticalAlerts > 0 || overdueReturns > 0 || blocked > ready) {
    status = 'critical';
  } else if (negativeScore > 0) {
    status = 'needs-attention';
  } else if (ready > 0 && negativeScore === 0) {
    status = 'strong';
  } else if (ready === 0) {
    status = 'needs-attention';
  }

  const hasReliableBasis =
    !input.telemetry.telemetryUnavailable || input.vehicles.length > 0;

  let scorePercent: number | null = null;
  if (hasReliableBasis && input.vehicles.length > 0) {
    const positive = ready;
    const pool = Math.max(input.vehicles.length, 1);
    const raw = Math.round((positive / pool) * 100);
    if (!input.telemetry.telemetryUnavailable) {
      scorePercent = raw;
    } else if (status === 'strong' || status === 'stable') {
      scorePercent = raw;
    }
  }

  return {
    status,
    statusLabel: statusLabel(status, input.locale),
    scorePercent,
    breakdown,
    hasReliableBasis,
  };
}

function classifyStationDataFreshness(vehicles: VehicleData[]): StationDataFreshness {
  if (vehicles.length === 0) return 'no-vehicles';

  const buckets: Record<VehicleTelemetryBucket, number> = {
    fresh: 0,
    stale: 0,
    offline: 0,
    unknown: 0,
  };
  for (const v of vehicles) {
    buckets[classifyTelemetry(v)] += 1;
  }

  const total = vehicles.length;
  if (buckets.offline === total) return 'offline';
  if (!vehicles.some((v) => v.lastSignal)) return 'offline';
  if (buckets.stale + buckets.offline >= total) return 'stale';
  if (buckets.stale + buckets.offline + buckets.unknown > buckets.fresh) return 'partial';
  return 'live';
}

export function stationDataFreshnessLabel(
  freshness: StationDataFreshness,
  locale: string,
): string {
  const de = locale === 'de';
  if (freshness === 'live') return de ? 'Live' : 'Live';
  if (freshness === 'partial') return de ? 'Teilweise' : 'Partial';
  if (freshness === 'stale') return de ? 'Signal verzögert' : 'Signal delayed';
  if (freshness === 'offline') return de ? 'Offline' : 'Offline';
  return de ? 'Keine Fahrzeuge' : 'No vehicles';
}

export function stationDataFreshnessTone(
  freshness: StationDataFreshness,
): 'success' | 'watch' | 'critical' | 'info' | 'neutral' {
  if (freshness === 'live') return 'success';
  if (freshness === 'partial') return 'info';
  if (freshness === 'stale') return 'watch';
  if (freshness === 'offline') return 'critical';
  return 'neutral';
}

function stationVehicleIds(vehicles: VehicleData[], stationId: string): Set<string> {
  const ids = new Set<string>();
  for (const v of vehicles) {
    if (
      v.stationId === stationId ||
      v.homeStationId === stationId ||
      v.currentStationId === stationId
    ) {
      ids.add(v.id);
    }
  }
  return ids;
}

function stationSeverity(input: {
  criticalAlerts: number;
  overdueCount: number;
  blockedCount: number;
  needsCleaningCount: number;
  capacityGap: number;
}): StationHealthSummary['statusSeverity'] {
  if (input.criticalAlerts > 0 || input.overdueCount > 0) return 'critical';
  if (input.capacityGap >= 2 || (input.capacityGap > 0 && input.blockedCount > 0)) {
    return 'warning';
  }
  if (input.blockedCount > 0 || input.needsCleaningCount > 2) return 'warning';
  if (input.needsCleaningCount > 0 || input.capacityGap > 0) return 'attention';
  return 'healthy';
}

export function buildEnhancedStationHealth(input: {
  stations: Station[];
  fleetVehicles: VehicleData[];
  healthAlerts: VehicleHealthAlert[];
  healthMap: Map<string, VehicleHealthResponse>;
  todayPickups: TodayBookingApiRow[];
  todayReturns: TodayBookingApiRow[];
}): StationHealthSummary[] {
  if (input.stations.length === 0) return [];

  return input.stations.map((s) => {
    const atStation = input.fleetVehicles.filter(
      (v) =>
        v.stationId === s.id ||
        v.homeStationId === s.id ||
        v.currentStationId === s.id,
    );
    const vehicleIds = stationVehicleIds(input.fleetVehicles, s.id);

    const pickupsToday = input.todayPickups.filter(
      (p) => p.pickupStationId === s.id,
    ).length;
    const returnsToday = input.todayReturns.filter(
      (r) => r.returnStationId === s.id,
    ).length;
    const overdueCount =
      input.todayPickups.filter((p) => p.pickupStationId === s.id && p.isOverdue).length +
      input.todayReturns.filter((r) => r.returnStationId === s.id && r.isOverdue).length;

    const criticalAlerts = input.healthAlerts.filter(
      (a) => a.severity === 'critical' && vehicleIds.has(a.vehicleId),
    ).length;

    const blockedCount = atStation.filter((v) => isBlockedVehicle(v, input.healthMap)).length;
    const readyCount = atStation.filter((v) =>
      isVehicleReadyToRent(v, {
        blockedVehicleIds: new Set(
          atStation.filter((x) => isBlockedVehicle(x, input.healthMap)).map((x) => x.id),
        ),
        healthRiskVehicleIds: new Set(
          input.healthAlerts
            .filter((a) => vehicleIds.has(a.vehicleId))
            .map((a) => a.vehicleId),
        ),
      }),
    ).length;
    const needsCleaningCount = atStation.filter((v) => v.cleaningStatus !== 'Clean').length;
    const maintenanceCount = atStation.filter((v) => v.status === 'Maintenance').length;

    const dueTodayCount = pickupsToday + returnsToday;
    const capacityGap = Math.max(0, dueTodayCount - readyCount);
    const dataFreshness = classifyStationDataFreshness(atStation);

    return {
      stationId: s.id,
      stationName: s.name,
      vehicleCount: atStation.length,
      availableCount: atStation.filter((v) => v.status === 'Available').length,
      rentedCount: atStation.filter((v) => v.status === 'Active Rented').length,
      reservedCount: atStation.filter((v) => v.status === 'Reserved').length,
      maintenanceCount,
      needsCleaningCount,
      alertCount: criticalAlerts,
      pickupsToday,
      returnsToday,
      overdueCount,
      criticalAlerts,
      blockedCount,
      readyCount,
      dueTodayCount,
      capacityGap,
      dataFreshness,
      statusSeverity: stationSeverity({
        criticalAlerts,
        overdueCount,
        blockedCount,
        needsCleaningCount,
        capacityGap,
      }),
    };
  });
}

export function syncStatusDisplay(status: DataSyncStatus, locale: string): string {
  const de = locale === 'de';
  if (status === 'live') return de ? 'Live' : 'Live';
  if (status === 'partial') return de ? 'Teilweise' : 'Partial';
  if (status === 'stale') return de ? 'Signal verzögert' : 'Signal delayed';
  return de ? 'Offline' : 'Offline';
}

export function readinessStatusTone(
  status: FleetReadinessStatus,
): 'success' | 'watch' | 'critical' | 'neutral' {
  if (status === 'strong') return 'success';
  if (status === 'stable') return 'success';
  if (status === 'needs-attention') return 'watch';
  if (status === 'critical') return 'critical';
  return 'neutral';
}

export function stationSeverityTone(
  severity: StationHealthSummary['statusSeverity'],
): 'success' | 'watch' | 'critical' | 'info' | 'neutral' {
  if (severity === 'healthy') return 'success';
  if (severity === 'attention') return 'info';
  if (severity === 'warning') return 'watch';
  return 'critical';
}

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
import { countReadyToRent, formatLastSyncLabel, isVehicleReadyToRent } from './dashboardUtils';
import type { DashboardRuntimeModel, VehicleRuntimeState } from './runtime/dashboardRuntimeTypes';

export type VehicleTelemetryBucket = 'live' | 'standby' | 'soft_offline' | 'offline' | 'unknown';

export interface VehicleTelemetryFreshness {
  totalInScope: number;
  liveCount: number;
  standbyCount: number;
  softOfflineCount: number;
  /** @deprecated Alias for live + standby compatibility. */
  freshCount: number;
  /** @deprecated Alias for softOfflineCount compatibility. */
  staleCount: number;
  offlineCount: number;
  unknownCount: number;
  hasReliableTimestamps: boolean;
  syncStatus: DataSyncStatus;
  lastRefreshLabel: string;
  telemetryUnavailable: boolean;
}

function classifyTelemetry(v: VehicleData): VehicleTelemetryBucket {
  const f = resolveTelemetryFreshness(v);
  if (f.isOffline) return 'offline';
  if (f.isNoSignal) return 'unknown';
  if (f.isSignalDelayed) return 'soft_offline';
  return 'standby';
}

function classifyRuntimeTelemetry(state: VehicleRuntimeState): VehicleTelemetryBucket {
  return state.telemetryState;
}

function syncStatusFromRuntime(input: {
  dataFreshness: DataFreshnessSummary;
  orgActive: boolean;
  liveishCount: number;
  softOfflineCount: number;
  offlineLikeCount: number;
  total: number;
  hasReliableBasis: boolean;
}): DataSyncStatus {
  if (!input.orgActive || input.dataFreshness.insightsError || input.dataFreshness.todayBookingsError) return 'partial';
  if (input.total === 0) return 'partial';
  if (!input.hasReliableBasis) return 'partial';
  if (input.offlineLikeCount >= input.total) return 'offline';
  if (input.softOfflineCount + input.offlineLikeCount > input.liveishCount) return 'partial';
  if (input.dataFreshness.insightsStale) return 'partial';
  return 'live';
}

export function computeVehicleTelemetryFreshness(input: {
  vehicles: VehicleData[];
  vehicleStates?: VehicleRuntimeState[];
  dataFreshness: DataFreshnessSummary;
  orgActive: boolean;
  locale: string;
  lastManualSyncAt: string | null;
}): VehicleTelemetryFreshness {
  const buckets: Record<VehicleTelemetryBucket, number> = {
    live: 0,
    standby: 0,
    soft_offline: 0,
    offline: 0,
    unknown: 0,
  };

  if (input.vehicleStates) {
    for (const state of input.vehicleStates) buckets[classifyRuntimeTelemetry(state)] += 1;
  } else {
    for (const v of input.vehicles) buckets[classifyTelemetry(v)] += 1;
  }

  const totalInScope = input.vehicleStates?.length ?? input.vehicles.length;
  const hasReliableTimestamps = input.vehicleStates
    ? input.vehicleStates.some((state) => state.telemetryState !== 'unknown')
    : input.vehicles.some((v) => !!v.lastSignal);
  const telemetryUnavailable = totalInScope > 0 && !hasReliableTimestamps;
  const liveishCount = buckets.live + buckets.standby;
  const offlineLikeCount = buckets.offline + buckets.unknown;

  const syncStatus = syncStatusFromRuntime({
    dataFreshness: input.dataFreshness,
    orgActive: input.orgActive,
    liveishCount,
    softOfflineCount: buckets.soft_offline,
    offlineLikeCount,
    total: totalInScope,
    hasReliableBasis: hasReliableTimestamps,
  });

  return {
    totalInScope,
    liveCount: buckets.live,
    standbyCount: buckets.standby,
    softOfflineCount: buckets.soft_offline,
    freshCount: liveishCount,
    staleCount: buckets.soft_offline,
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

function availableButNotReadyCount(runtime: DashboardRuntimeModel | undefined): number {
  if (!runtime) return 0;
  const slice = runtime.slices['ready-to-rent'];
  const groupRows = slice.groups?.find((group) => group.id === 'available-but-not-ready')?.rows;
  return groupRows?.length ?? slice.secondaryRows?.length ?? 0;
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
  runtime?: DashboardRuntimeModel;
}): FleetReadinessSummary {
  const runtime = input.runtime;
  const scopedAlertIds = new Set(input.vehicles.map((v) => v.id));
  const criticalAlerts = runtime?.slices['critical-alerts'].count ?? input.healthAlerts.filter(
    (a) => a.severity === 'critical' && scopedAlertIds.has(a.vehicleId),
  ).length;

  const ready = runtime?.slices['ready-to-rent'].count ?? countReadyToRent(input.availableVehicles, input.readyOptions);
  const blocked = runtime?.slices['blocked-maintenance'].count ?? input.vehicles.filter((v) => isBlockedVehicle(v, input.healthMap)).length;
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
  const overdueReturns = runtime?.slices['overdue-returns'].count ?? overdueFromReturns + overdueFromFleet;
  const cleaningNeeded = runtime?.vehicleStates.filter(
    (state) =>
      (state.operationalStatus === 'available' || state.operationalStatus === 'reserved') &&
      state.warningReasons.some((reason) => reason.category === 'cleaning'),
  ).length ?? input.vehicles.filter(
    (v) => v.cleaningStatus !== 'Clean' && (v.status === 'Available' || v.status === 'Reserved'),
  ).length;
  const softOfflineCount = runtime?.vehicleStates.filter(
    (state) => state.telemetryState === 'soft_offline',
  ).length ?? input.telemetry.softOfflineCount ?? input.telemetry.staleCount;
  const offlineCount = runtime?.vehicleStates.filter(
    (state) => state.telemetryState === 'offline',
  ).length ?? input.telemetry.offlineCount;
  const staleData = softOfflineCount + offlineCount;
  const conflicts = runtime ? availableButNotReadyCount(runtime) : countConflicts(input.vehicles, input.healthMap);

  const breakdown: FleetReadinessBreakdown = {
    ready,
    blocked,
    overdueReturns,
    criticalAlerts,
    cleaningNeeded,
    softOfflineCount,
    offlineCount,
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
    Math.floor(softOfflineCount / 2) +
    offlineCount * 2;

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
    live: 0,
    standby: 0,
    soft_offline: 0,
    offline: 0,
    unknown: 0,
  };
  for (const v of vehicles) {
    buckets[classifyTelemetry(v)] += 1;
  }

  const total = vehicles.length;
  const liveish = buckets.live + buckets.standby;
  if (buckets.offline === total) return 'offline';
  if (!vehicles.some((v) => v.lastSignal)) return 'offline';
  if (buckets.soft_offline + buckets.offline >= total) return 'stale';
  if (buckets.soft_offline + buckets.offline + buckets.unknown > liveish) return 'partial';
  return 'live';
}

function classifyStationRuntimeFreshness(states: VehicleRuntimeState[]): StationDataFreshness {
  if (states.length === 0) return 'no-vehicles';
  const offline = states.filter((state) => state.telemetryState === 'offline' || state.telemetryState === 'unknown').length;
  const softOffline = states.filter((state) => state.telemetryState === 'soft_offline').length;
  const liveish = states.length - offline - softOffline;
  if (offline === states.length) return 'offline';
  if (softOffline + offline >= states.length) return 'stale';
  if (softOffline + offline > liveish) return 'partial';
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
  runtime?: DashboardRuntimeModel;
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
    const runtimeStates = input.runtime?.vehicleStates.filter(
      (state) => state.stationId === s.id || state.stationLabel === s.name,
    ) ?? [];

    const pickupsToday = input.todayPickups.filter(
      (p) => p.pickupStationId === s.id,
    ).length;
    const returnsToday = input.todayReturns.filter(
      (r) => r.returnStationId === s.id,
    ).length;
    const overdueCount =
      input.todayPickups.filter((p) => p.pickupStationId === s.id && p.isOverdue).length +
      input.todayReturns.filter((r) => r.returnStationId === s.id && r.isOverdue).length;

    const criticalAlerts = runtimeStates.length > 0 ? runtimeStates.filter(
      (state) => state.isCritical,
    ).length : input.healthAlerts.filter(
      (a) => a.severity === 'critical' && vehicleIds.has(a.vehicleId),
    ).length;

    const blockedCount = runtimeStates.length > 0 ? runtimeStates.filter(
      (state) => state.isBlocked || state.isMaintenance || state.operationalStatus === 'unavailable',
    ).length : atStation.filter((v) => isBlockedVehicle(v, input.healthMap)).length;
    const readyCount = runtimeStates.length > 0 ? runtimeStates.filter((state) => state.isReadyToRent).length : atStation.filter((v) =>
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
    const needsCleaningCount = runtimeStates.length > 0 ? runtimeStates.filter(
      (state) => state.warningReasons.some((reason) => reason.category === 'cleaning'),
    ).length : atStation.filter((v) => v.cleaningStatus !== 'Clean').length;
    const maintenanceCount = runtimeStates.length > 0 ? runtimeStates.filter(
      (state) => state.isMaintenance,
    ).length : atStation.filter((v) => v.status === 'Maintenance').length;
    const availableNotReadyCount = runtimeStates.filter(
      (state) => state.operationalStatus === 'available' && !state.isReadyToRent,
    ).length;
    const warningCount = runtimeStates.filter((state) => state.isWarning && !state.isCritical).length;
    const softOfflineCount = runtimeStates.filter((state) => state.telemetryState === 'soft_offline').length;
    const offlineCount = runtimeStates.filter((state) => state.telemetryState === 'offline').length;

    const dueTodayCount = pickupsToday + returnsToday;
    const capacityGap = Math.max(0, dueTodayCount - readyCount);
    const dataFreshness = runtimeStates.length > 0
      ? classifyStationRuntimeFreshness(runtimeStates)
      : classifyStationDataFreshness(atStation);

    return {
      stationId: s.id,
      stationName: s.name,
      vehicleCount: runtimeStates.length || atStation.length,
      availableCount: runtimeStates.length > 0
        ? runtimeStates.filter((state) => state.operationalStatus === 'available').length
        : atStation.filter((v) => v.status === 'Available').length,
      rentedCount: runtimeStates.length > 0
        ? runtimeStates.filter((state) => state.operationalStatus === 'active_rented').length
        : atStation.filter((v) => v.status === 'Active Rented').length,
      reservedCount: runtimeStates.length > 0
        ? runtimeStates.filter((state) => state.operationalStatus === 'reserved').length
        : atStation.filter((v) => v.status === 'Reserved').length,
      maintenanceCount,
      needsCleaningCount,
      availableNotReadyCount,
      warningCount,
      softOfflineCount,
      offlineCount,
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

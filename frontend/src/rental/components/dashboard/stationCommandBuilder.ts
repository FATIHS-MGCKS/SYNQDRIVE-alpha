import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ActionQueueItem,
  NowNextTimelineModel,
  OperationTimelineItem,
  StationCommandDetail,
  StationHealthSummary,
  StationVehicleChip,
  UnassignedFleetSummary,
} from './dashboardTypes';
import { isVehicleReadyToRent, parseEventTime, type ReadyToRentOptions } from './dashboardUtils';
import type { VehicleRuntimeState } from './runtime';
import { VEHICLE_OPERATIONAL_STATUS } from '../../lib/vehicle-operational-state';

const MS_HOUR = 60 * 60_000;
const TIMELINE_WINDOW_MS = 24 * MS_HOUR;

const SEVERITY_RANK: Record<StationHealthSummary['statusSeverity'], number> = {
  critical: 0,
  warning: 1,
  attention: 2,
  healthy: 3,
};

function vehicleAtStation(v: VehicleData, stationId: string): boolean {
  return (
    v.stationId === stationId ||
    v.homeStationId === stationId ||
    v.currentStationId === stationId
  );
}

function vehicleChip(v: VehicleData, hint?: string): StationVehicleChip {
  return {
    vehicleId: v.id,
    label: v.license || v.model,
    hint,
  };
}

function runtimeVehicleChip(state: VehicleRuntimeState, hint?: string): StationVehicleChip {
  return {
    vehicleId: state.vehicleId,
    label: state.license || state.displayName,
    hint,
  };
}

function isBlockedVehicle(
  v: VehicleData,
  healthMap: Map<string, VehicleHealthResponse>,
): boolean {
  if (v.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) return true;
  return healthMap.get(v.id)?.rental_blocked === true;
}

function hasStationAssignment(v: VehicleData): boolean {
  return !!(v.stationId || v.homeStationId || v.currentStationId);
}

export function sortStationCommandSummaries(
  stations: StationHealthSummary[],
): StationHealthSummary[] {
  return [...stations].sort((a, b) => {
    const sev = SEVERITY_RANK[a.statusSeverity] - SEVERITY_RANK[b.statusSeverity];
    if (sev !== 0) return sev;
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    if (b.capacityGap !== a.capacityGap) return b.capacityGap - a.capacityGap;
    if (b.criticalAlerts !== a.criticalAlerts) return b.criticalAlerts - a.criticalAlerts;
    return a.stationName.localeCompare(b.stationName);
  });
}

export function buildUnassignedFleetSummary(
  fleetVehicles: VehicleData[],
): UnassignedFleetSummary {
  const unassigned = fleetVehicles.filter((v) => !hasStationAssignment(v));
  return {
    count: unassigned.length,
    vehicles: unassigned.slice(0, 8).map((v) =>
      vehicleChip(v, v.station || undefined),
    ),
  };
}

function flattenTimeline(timeline: NowNextTimelineModel): OperationTimelineItem[] {
  const lanes = timeline.lanes;
  return [
    ...lanes.now,
    ...lanes.next60,
    ...lanes['later-today'],
    ...lanes.tomorrow,
  ];
}

export function buildStationCommandDetail(input: {
  stationId: string;
  stationHealth: StationHealthSummary[];
  fleetVehicles: VehicleData[];
  vehicleStates?: VehicleRuntimeState[];
  healthMap: Map<string, VehicleHealthResponse>;
  healthAlerts: VehicleHealthAlert[];
  readyOptions: ReadyToRentOptions;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  nowNextTimeline: NowNextTimelineModel;
  actionQueue: ActionQueueItem[];
}): StationCommandDetail | null {
  const station =
    input.stationHealth.find((s) => s.stationId === input.stationId) ?? null;
  if (!station) return null;

  const atStation = input.fleetVehicles.filter((v) => vehicleAtStation(v, input.stationId));
  const stationStates = input.vehicleStates?.filter(
    (state) => state.stationId === input.stationId || state.stationLabel === station.stationName,
  ) ?? [];
  const criticalByVehicle = new Map(
    input.healthAlerts
      .filter((a) => a.severity === 'critical')
      .map((a) => [a.vehicleId, a] as const),
  );

  const readyVehicles = stationStates.length > 0
    ? stationStates
        .filter((state) => state.isReadyToRent)
        .slice(0, 6)
        .map((state) => runtimeVehicleChip(state, state.readyReasons[0]?.title))
    : atStation
        .filter((v) => isVehicleReadyToRent(v, input.readyOptions))
        .slice(0, 6)
        .map((v) => vehicleChip(v));

  const blockedVehicles = stationStates.length > 0
    ? stationStates
        .filter((state) => state.isBlocked || state.isMaintenance || state.operationalStatus === 'unavailable')
        .slice(0, 6)
        .map((state) => runtimeVehicleChip(state, state.blockReasons[0]?.title ?? state.notReadyReasons[0]?.title))
    : atStation
        .filter((v) => isBlockedVehicle(v, input.healthMap))
        .slice(0, 6)
        .map((v) =>
          vehicleChip(
            v,
            v.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE
              ? 'Maintenance'
              : 'Blocked',
          ),
        );

  const criticalVehicles = stationStates.length > 0
    ? stationStates
        .filter((state) => state.isCritical)
        .slice(0, 6)
        .map((state) => runtimeVehicleChip(state, state.criticalReasons[0]?.title))
    : atStation
        .filter((v) => criticalByVehicle.has(v.id))
        .slice(0, 6)
        .map((v) => vehicleChip(v, criticalByVehicle.get(v.id)?.primaryReason));

  const now = Date.now();
  const timelineItems = flattenTimeline(input.nowNextTimeline)
    .filter((item) => !item.completed && item.timeMs <= now + TIMELINE_WINDOW_MS)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, 8);

  return {
    station,
    readyVehicles,
    blockedVehicles,
    criticalVehicles,
    pickups: input.pickupItems.filter((p) => !p.done),
    returns: input.returnItems.filter((r) => !r.done),
    timelineItems,
    actionItems: input.actionQueue.slice(0, 5),
  };
}

export function buildFallbackStationSummary(input: {
  stationId: string;
  stationName: string | null;
  fleetVehicles: VehicleData[];
  vehicleStates?: VehicleRuntimeState[];
  locale: string;
}): StationHealthSummary {
  const de = input.locale === 'de';
  const atStation = input.fleetVehicles.filter((v) => vehicleAtStation(v, input.stationId));
  const stationStates = input.vehicleStates?.filter(
    (state) => state.stationId === input.stationId || state.stationLabel === input.stationName,
  ) ?? [];
  const useRuntime = stationStates.length > 0;
  return {
    stationId: input.stationId,
    stationName: input.stationName ?? (de ? 'Unbekannte Station' : 'Unknown station'),
    vehicleCount: useRuntime ? stationStates.length : atStation.length,
    availableCount: useRuntime ? stationStates.filter((state) => state.operationalStatus === 'available').length : atStation.filter((v) => v.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE).length,
    rentedCount: useRuntime ? stationStates.filter((state) => state.operationalStatus === 'active_rented').length : atStation.filter((v) => v.status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED).length,
    reservedCount: useRuntime ? stationStates.filter((state) => state.operationalStatus === 'reserved').length : atStation.filter((v) => v.status === VEHICLE_OPERATIONAL_STATUS.RESERVED).length,
    maintenanceCount: useRuntime ? stationStates.filter((state) => state.isMaintenance).length : atStation.filter((v) => v.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE).length,
    needsCleaningCount: useRuntime ? stationStates.filter((state) => state.warningReasons.some((reason) => reason.category === 'cleaning')).length : atStation.filter((v) => v.cleaningStatus !== 'Clean').length,
    availableNotReadyCount: useRuntime ? stationStates.filter((state) => state.operationalStatus === 'available' && !state.isReadyToRent).length : undefined,
    warningCount: useRuntime ? stationStates.filter((state) => state.isWarning && !state.isCritical).length : undefined,
    softOfflineCount: useRuntime ? stationStates.filter((state) => state.telemetryState === 'soft_offline').length : undefined,
    offlineCount: useRuntime ? stationStates.filter((state) => state.telemetryState === 'offline').length : undefined,
    alertCount: 0,
    pickupsToday: 0,
    returnsToday: 0,
    overdueCount: 0,
    criticalAlerts: 0,
    blockedCount: useRuntime ? stationStates.filter((state) => state.isBlocked || state.isMaintenance || state.operationalStatus === 'unavailable').length : 0,
    readyCount: useRuntime ? stationStates.filter((state) => state.isReadyToRent).length : 0,
    dueTodayCount: 0,
    capacityGap: 0,
    dataFreshness: atStation.length === 0 ? 'no-vehicles' : 'partial',
    statusSeverity: 'attention',
  };
}

export function isPickupInNext24h(startDate: string | undefined): boolean {
  const ms = parseEventTime(startDate);
  if (ms == null) return false;
  const diff = ms - Date.now();
  return diff >= 0 && diff <= TIMELINE_WINDOW_MS;
}

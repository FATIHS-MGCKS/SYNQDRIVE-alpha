import { VehicleStatus } from '@prisma/client';
import { isForeignVehicleOnSite } from './station-capacity-policy';
import {
  STATION_FLEET_DEFAULT_PAGE_SIZE,
  STATION_FLEET_GROUP_ORDER,
  STATION_FLEET_MAX_PAGE_SIZE,
  StationFleetGroupKey,
  type StationFleetGroupSection,
  type StationFleetNextAction,
  type StationFleetReadModel,
  type StationFleetStationRef,
  type StationFleetVehicleRow,
} from './station-fleet-read-model.contract';

export interface StationFleetResolverVehicle {
  id: string;
  vehicleName: string | null;
  make: string;
  model: string;
  licensePlate: string | null;
  status: VehicleStatus;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  currentStationSource: string | null;
  currentStationConfirmedAt: Date | string | null;
}

export interface StationFleetResolverInput {
  organizationId: string;
  stationId: string;
  evaluatedAt: string;
  vehicles: StationFleetResolverVehicle[];
  stationDirectory: Map<string, StationFleetStationRef>;
  search?: string | null;
  groupFilter?: StationFleetGroupKey | null;
  page?: number;
  pageSize?: number;
  scopeApplied?: boolean;
}

export function normalizeStationFleetPageSize(pageSize?: number): {
  pageSize: number;
  capped: boolean;
} {
  if (pageSize == null || !Number.isFinite(pageSize)) {
    return { pageSize: STATION_FLEET_DEFAULT_PAGE_SIZE, capped: false };
  }
  const normalized = Math.floor(pageSize);
  if (normalized <= 0) {
    return { pageSize: STATION_FLEET_DEFAULT_PAGE_SIZE, capped: true };
  }
  if (normalized > STATION_FLEET_MAX_PAGE_SIZE) {
    return { pageSize: STATION_FLEET_MAX_PAGE_SIZE, capped: true };
  }
  return { pageSize: normalized, capped: false };
}

export function classifyStationFleetGroup(
  vehicle: StationFleetResolverVehicle,
  stationId: string,
): StationFleetGroupKey {
  if (isForeignVehicleOnSite(vehicle, stationId)) {
    return StationFleetGroupKey.FOREIGN_ON_SITE;
  }

  if (vehicle.currentStationId === stationId && vehicle.homeStationId === stationId) {
    return StationFleetGroupKey.ON_SITE;
  }

  if (
    vehicle.expectedStationId === stationId &&
    vehicle.currentStationId !== stationId
  ) {
    return StationFleetGroupKey.EXPECTED;
  }

  if (
    vehicle.homeStationId === stationId &&
    vehicle.status === VehicleStatus.RENTED &&
    vehicle.currentStationId !== stationId
  ) {
    return StationFleetGroupKey.CURRENTLY_RENTED;
  }

  if (vehicle.homeStationId === stationId && vehicle.currentStationId !== stationId) {
    return StationFleetGroupKey.HOME_FLEET_AWAY;
  }

  if (vehicle.currentStationId === stationId) {
    return StationFleetGroupKey.FOREIGN_ON_SITE;
  }

  if (vehicle.expectedStationId === stationId) {
    return StationFleetGroupKey.EXPECTED;
  }

  return StationFleetGroupKey.HOME_FLEET_AWAY;
}

function runtimeStateLabel(status: string): string {
  switch (status) {
    case VehicleStatus.AVAILABLE:
      return 'Available';
    case VehicleStatus.RENTED:
      return 'Rented';
    case VehicleStatus.IN_SERVICE:
      return 'In service';
    case VehicleStatus.OUT_OF_SERVICE:
      return 'Out of service';
    case VehicleStatus.RESERVED:
      return 'Reserved';
    default:
      return status;
  }
}

function resolveStationRef(
  stationId: string | null,
  directory: Map<string, StationFleetStationRef>,
): StationFleetStationRef | null {
  if (!stationId) return null;
  return directory.get(stationId) ?? { id: stationId, name: stationId, code: null };
}

export function deriveStationFleetNextAction(
  vehicle: StationFleetResolverVehicle,
  group: StationFleetGroupKey,
): StationFleetNextAction | null {
  switch (group) {
    case StationFleetGroupKey.ON_SITE:
      if (vehicle.status === VehicleStatus.IN_SERVICE || vehicle.status === VehicleStatus.OUT_OF_SERVICE) {
        return {
          code: 'RESOLVE_MAINTENANCE',
          label: 'Resolve maintenance block',
          deepLink: `vehicle:${vehicle.id}`,
        };
      }
      if (vehicle.status === VehicleStatus.AVAILABLE) {
        return {
          code: 'REVIEW_READY',
          label: 'Review rental readiness',
          deepLink: `vehicle:${vehicle.id}`,
        };
      }
      return {
        code: 'OPEN_VEHICLE',
        label: 'Open vehicle',
        deepLink: `vehicle:${vehicle.id}`,
      };
    case StationFleetGroupKey.FOREIGN_ON_SITE:
      return {
        code: 'REVIEW_FOREIGN',
        label: 'Review foreign vehicle on site',
        deepLink: `vehicle:${vehicle.id}`,
      };
    case StationFleetGroupKey.EXPECTED:
      return {
        code: 'PREPARE_ARRIVAL',
        label: 'Prepare for expected arrival',
        deepLink: `vehicle:${vehicle.id}`,
      };
    case StationFleetGroupKey.CURRENTLY_RENTED:
      return {
        code: 'TRACK_RETURN',
        label: 'Track rental return',
        deepLink: `vehicle:${vehicle.id}`,
      };
    case StationFleetGroupKey.HOME_FLEET_AWAY:
      return {
        code: 'LOCATE_VEHICLE',
        label: 'Locate or transfer vehicle',
        deepLink: `vehicle:${vehicle.id}`,
      };
    default:
      return null;
  }
}

function matchesFleetSearch(vehicle: StationFleetResolverVehicle, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    vehicle.licensePlate,
    vehicle.make,
    vehicle.model,
    vehicle.vehicleName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalPages,
  };
}

function mapVehicleRow(
  vehicle: StationFleetResolverVehicle,
  group: StationFleetGroupKey,
  directory: Map<string, StationFleetStationRef>,
): StationFleetVehicleRow {
  const lastConfirmationAt =
    vehicle.currentStationConfirmedAt == null
      ? null
      : vehicle.currentStationConfirmedAt instanceof Date
        ? vehicle.currentStationConfirmedAt.toISOString()
        : String(vehicle.currentStationConfirmedAt);

  return {
    id: vehicle.id,
    licensePlate: vehicle.licensePlate,
    make: vehicle.make,
    model: vehicle.model,
    vehicleName: vehicle.vehicleName,
    runtimeState: String(vehicle.status),
    runtimeStateLabel: runtimeStateLabel(String(vehicle.status)),
    homeStation: resolveStationRef(vehicle.homeStationId, directory),
    currentStation: resolveStationRef(vehicle.currentStationId, directory),
    expectedStation: resolveStationRef(vehicle.expectedStationId, directory),
    positionSource: vehicle.currentStationSource,
    lastConfirmationAt,
    nextAction: deriveStationFleetNextAction(vehicle, group),
    group,
  };
}

export function resolveStationFleetReadModel(
  input: StationFleetResolverInput,
): StationFleetReadModel {
  const search = input.search?.trim() ? input.search.trim() : null;
  const { pageSize } = normalizeStationFleetPageSize(input.pageSize);
  const page = input.page != null && input.page > 0 ? Math.floor(input.page) : 1;

  const grouped = new Map<StationFleetGroupKey, StationFleetVehicleRow[]>();
  for (const key of STATION_FLEET_GROUP_ORDER) {
    grouped.set(key, []);
  }

  for (const vehicle of input.vehicles) {
    if (search && !matchesFleetSearch(vehicle, search)) continue;
    const group = classifyStationFleetGroup(vehicle, input.stationId);
    grouped.get(group)?.push(mapVehicleRow(vehicle, group, input.stationDirectory));
  }

  const visibleGroups = input.groupFilter
    ? STATION_FLEET_GROUP_ORDER.filter((key) => key === input.groupFilter)
    : STATION_FLEET_GROUP_ORDER;

  const groups: StationFleetGroupSection[] = visibleGroups.map((key) => {
    const allRows = grouped.get(key) ?? [];
    const { rows, totalPages } = paginateRows(allRows, page, pageSize);
    return {
      key,
      total: allRows.length,
      vehicles: rows,
      pagination: {
        page: Math.min(page, totalPages),
        pageSize,
        totalPages,
      },
    };
  });

  return {
    version: 1,
    stationId: input.stationId,
    organizationId: input.organizationId,
    evaluatedAt: input.evaluatedAt,
    search,
    groupFilter: input.groupFilter ?? null,
    groups,
    scope: {
      applied: input.scopeApplied ?? false,
      mode: input.scopeApplied ? 'SCOPED_STATIONS' : 'ALL_STATIONS',
    },
    frontendRecomputation: false,
  };
}

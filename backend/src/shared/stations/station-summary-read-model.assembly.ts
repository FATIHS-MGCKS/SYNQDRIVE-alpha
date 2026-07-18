import { StationCalendarExceptionStatus } from '@prisma/client';
import type { CleaningStatus, VehicleStatus } from '@prisma/client';
import type { VehicleRuntimeProjectionInput } from '@shared/vehicle-runtime-state/vehicle-runtime-state.contract';
import type { StationAccessScope } from './station-access-scope.types';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import { resolveStationKpis } from './station-kpis.resolver';
import {
  resolveStationOperationsSummary,
  type StationOperationsNotificationInput,
  type StationOperationsTaskInput,
} from './station-operations-summary.resolver';
import {
  resolveStationOperations,
  type StationOperationsSnapshot,
} from './station-operations.resolver';
import { StationOperationalCalendarExceptionInput } from './station-operational-capability.resolver';
import {
  resolveStationSummaryReadModel,
  type StationSummaryReadModel,
} from './station-summary-read-model.resolver';
import { STATION_STATUS_LABELS, STATION_TYPE_LABELS } from '@modules/stations/station.types';

export type StationSummaryLoadRow = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  status: import('@prisma/client').StationStatus;
  type: import('@prisma/client').StationType;
  isPrimary: boolean;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  timezone: string | null;
  capacity: number | null;
  archivedAt: Date | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  openingHours: unknown;
  holidayRules: unknown;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  calendarExceptions: Array<{
    id: string;
    type: import('@prisma/client').StationCalendarExceptionType;
    title: string;
    recurrenceKind: import('@prisma/client').StationCalendarRecurrenceKind;
    calendarDate: Date | null;
    monthDay: string | null;
    closedAllDay: boolean;
    slots: unknown;
    regionCode: string | null;
    priority: number;
    source: import('@prisma/client').StationCalendarExceptionSource;
  }>;
};

export type StationSummaryVehicleRow = {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  status: VehicleStatus;
  cleaningStatus: CleaningStatus;
  latestState: {
    lastSeenAt: Date | null;
    odometerKm: number | null;
    speedKmh: number | null;
    isIgnitionOn: boolean | null;
  } | null;
};

export type StationSummaryBookingRow = {
  id: string;
  status: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  startDate: Date;
  endDate: Date;
};

export type StationSummaryTransferRow = {
  id: string;
  fromStationId: string | null;
  toStationId: string;
  status: string;
};

export type StationSummaryOpenTaskRow = {
  id: string;
  type: import('@prisma/client').TaskType;
  vehicleId: string | null;
  bookingId: string | null;
  metadata: unknown;
};

export const stationSummaryLoadInclude = {
  calendarExceptions: {
    where: { status: StationCalendarExceptionStatus.ACTIVE },
    orderBy: [{ priority: 'desc' as const }, { calendarDate: 'asc' as const }],
  },
};

export function vehicleLinksToStation(
  vehicle: Pick<
    StationSummaryVehicleRow,
    'homeStationId' | 'currentStationId' | 'expectedStationId'
  >,
  stationId: string,
): boolean {
  return (
    vehicle.homeStationId === stationId ||
    vehicle.currentStationId === stationId ||
    vehicle.expectedStationId === stationId
  );
}

export function bookingLinksToStation(
  booking: Pick<StationSummaryBookingRow, 'pickupStationId' | 'returnStationId'>,
  stationId: string,
): boolean {
  return booking.pickupStationId === stationId || booking.returnStationId === stationId;
}

export function transferLinksToStation(
  transfer: Pick<StationSummaryTransferRow, 'fromStationId' | 'toStationId'>,
  stationId: string,
): boolean {
  return transfer.fromStationId === stationId || transfer.toStationId === stationId;
}

export function filterVehiclesForStation(
  vehicles: StationSummaryVehicleRow[],
  stationId: string,
): StationSummaryVehicleRow[] {
  return vehicles.filter((vehicle) => vehicleLinksToStation(vehicle, stationId));
}

export function filterBookingsForStation(
  bookings: StationSummaryBookingRow[],
  stationId: string,
): StationSummaryBookingRow[] {
  return bookings.filter((booking) => bookingLinksToStation(booking, stationId));
}

export function filterTransfersForStation(
  transfers: StationSummaryTransferRow[],
  stationId: string,
): StationSummaryTransferRow[] {
  return transfers.filter((transfer) => transferLinksToStation(transfer, stationId));
}

function readTaskStationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const stationId = (metadata as { stationId?: unknown }).stationId;
  return typeof stationId === 'string' && stationId.length > 0 ? stationId : null;
}

export function taskLinksToStation(
  task: StationSummaryOpenTaskRow,
  stationId: string,
  linkedVehicleIds: ReadonlySet<string>,
  linkedBookingIds: ReadonlySet<string>,
): boolean {
  if (readTaskStationId(task.metadata) === stationId) {
    return true;
  }
  if (task.vehicleId && linkedVehicleIds.has(task.vehicleId)) {
    return true;
  }
  if (task.bookingId && linkedBookingIds.has(task.bookingId)) {
    return true;
  }
  return false;
}

export function countOpenTasksForStation(
  tasks: StationSummaryOpenTaskRow[],
  stationId: string,
  linkedVehicleIds: ReadonlySet<string>,
  linkedBookingIds: ReadonlySet<string>,
): number {
  return tasks.reduce(
    (count, task) =>
      taskLinksToStation(task, stationId, linkedVehicleIds, linkedBookingIds) ? count + 1 : count,
    0,
  );
}

export function assembleStationSummaryFromLoadRow(
  station: StationSummaryLoadRow,
  vehicles: StationSummaryVehicleRow[],
  bookings: StationSummaryBookingRow[],
  transfers: StationSummaryTransferRow[],
  openTasks: StationSummaryOpenTaskRow[],
  notifications: StationOperationsNotificationInput[],
  evaluatedAt: string,
  access: StationAccessScope,
  vehicleRuntime?: VehicleRuntimeProjectionInput[] | null,
): StationSummaryReadModel {
  const stationId = station.id;
  const calendarExceptions: StationOperationalCalendarExceptionInput[] =
    station.calendarExceptions.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      recurrenceKind: row.recurrenceKind,
      calendarDate: row.calendarDate?.toISOString().slice(0, 10) ?? null,
      monthDay: row.monthDay,
      closedAllDay: row.closedAllDay,
      slots: (row.slots as StationOperationalCalendarExceptionInput['slots']) ?? null,
      regionCode: row.regionCode,
      priority: row.priority,
      source: row.source,
    }));

  const operationsSnapshot: StationOperationsSnapshot = {
    stationId: station.id,
    organizationId: station.organizationId,
    status: station.status,
    pickupEnabled: station.pickupEnabled,
    returnEnabled: station.returnEnabled,
    afterHoursReturnEnabled: station.afterHoursReturnEnabled,
    keyBoxAvailable: station.keyBoxAvailable,
    timezone: station.timezone,
    openingHours: station.openingHours,
    legacyHolidayRules: station.holidayRules,
    calendarExceptions,
    temporaryOperationalRules: [],
    latitude: station.latitude,
    longitude: station.longitude,
    radiusMeters: station.radiusMeters,
    capacity: station.capacity,
    vehicles,
  };

  const operations = resolveStationOperations(operationsSnapshot, { at: evaluatedAt });
  const timezone = station.timezone?.trim() || 'Europe/Berlin';
  const scopeApplied = access.mode !== STATION_SCOPE_MODE.ALL_STATIONS;

  const stationTasks: StationOperationsTaskInput[] = openTasks.map((task) => ({
    id: task.id,
    type: task.type,
    vehicleId: task.vehicleId,
    bookingId: task.bookingId,
    metadata: task.metadata,
  }));

  const operationsSummary = resolveStationOperationsSummary({
    stationId,
    evaluatedAt,
    tasks: stationTasks,
    notifications,
    vehicles,
    bookings,
    transfers,
    configurationProblems: operations.configurationProblems,
    operationalWarnings: operations.operationalWarnings,
  });

  const openOperationalTasksCount = operationsSummary.tasks.total;

  const kpis = resolveStationKpis({
    stationId,
    timezone,
    evaluatedAt,
    configuredCapacity: station.capacity,
    scope: {
      applied: scopeApplied,
      mode: scopeApplied ? 'SCOPED_STATIONS' : 'ALL_STATIONS',
      stationId,
    },
    vehicles,
    vehicleRuntime,
    bookings: bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      pickupStationId: booking.pickupStationId,
      returnStationId: booking.returnStationId,
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
    })),
    transfers,
    openOperationalTasksCount,
  });

  return resolveStationSummaryReadModel({
    evaluatedAt,
    masterData: {
      id: station.id,
      organizationId: station.organizationId,
      name: station.name,
      code: station.code,
      address: station.address,
      addressLine2: station.addressLine2,
      city: station.city,
      postalCode: station.postalCode,
      country: station.country,
      phone: station.phone,
      email: station.email,
      managerName: station.managerName,
      timezone,
      capacity: station.capacity,
    },
    lifecycle: {
      status: station.status,
      statusLabel: STATION_STATUS_LABELS[station.status],
      type: station.type,
      typeLabel: STATION_TYPE_LABELS[station.type],
      isPrimary: station.isPrimary,
      archived: station.status === 'ARCHIVED',
      archivedAt: station.archivedAt?.toISOString() ?? null,
    },
    operations,
    kpis,
    operationsSummary,
    scope: kpis.scope,
  });
}

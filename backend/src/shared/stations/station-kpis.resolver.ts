import { VehicleStatus } from '@prisma/client';
import { resolveZonedCalendarDayWindow } from '@modules/bookings/booking-day-window.util';
import {
  evaluateStationCapacityPolicy,
  isForeignVehicleOnSite,
} from './station-capacity-policy';
import type { StationCapacityStatus } from './station-capacity-policy.contract';
import {
  ACTIVE_STATION_KPI_BOOKING_STATUSES,
  ACTIVE_STATION_KPI_TRANSFER_STATUSES,
  STATION_KPIS_VERSION,
  StationKpiReasonCode,
  type StationKpiMetric,
  type StationKpiReason,
  type StationKpisEvaluationInput,
  type StationKpisResult,
} from './station-kpis.contract';

export * from './station-kpis.contract';

function reason(code: StationKpiReason['code'], message: string): StationKpiReason {
  return { code, message };
}

function knownMetric<T>(value: T, reasons: StationKpiReason[] = []): StationKpiMetric<T> {
  return { value, known: true, reasons };
}

function unknownMetric<T>(
  reasons: StationKpiReason[],
  partial = false,
): StationKpiMetric<T> {
  return { value: null, known: false, partial, reasons };
}

function isActiveBookingStatus(status: string): boolean {
  return (ACTIVE_STATION_KPI_BOOKING_STATUSES as readonly string[]).includes(status);
}

function isActiveTransferStatus(status: string): boolean {
  return (ACTIVE_STATION_KPI_TRANSFER_STATUSES as readonly string[]).includes(status);
}

function isOnSiteAtStation(
  vehicle: { currentStationId: string | null },
  stationId: string,
): boolean {
  return vehicle.currentStationId === stationId;
}

function isExpectedArrival(
  vehicle: {
    expectedStationId: string | null;
    currentStationId: string | null;
  },
  stationId: string,
): boolean {
  return (
    vehicle.expectedStationId === stationId &&
    vehicle.currentStationId !== stationId
  );
}

function parseInstant(value: string): Date {
  return new Date(value);
}

function isWithinInclusiveRange(instant: Date, start: Date, end: Date): boolean {
  const time = instant.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

export function resolveStationKpis(input: StationKpisEvaluationInput): StationKpisResult {
  const evaluatedAt = parseInstant(input.evaluatedAt);
  const dayWindow = resolveZonedCalendarDayWindow(evaluatedAt, input.timezone);

  const scopeReasons = [
    reason(
      StationKpiReasonCode.SCOPE_APPLIED,
      input.scope.applied
        ? `KPIs computed for station ${input.scope.stationId} with ${input.scope.mode} scope.`
        : `KPIs computed without explicit scope filtering.`,
    ),
    reason(
      StationKpiReasonCode.STATION_TIMEZONE_USED,
      `Calendar day ${dayWindow.dateOnly} resolved in station timezone ${input.timezone}.`,
    ),
  ];

  const vehicles = input.vehicles;
  const bookings = input.bookings;
  const transfers = input.transfers;

  const vehicleReasons = [
    ...scopeReasons,
    reason(
      StationKpiReasonCode.RUNTIME_VEHICLE_STATUS,
      'Vehicle runtime status is the source of truth for on-site availability KPIs.',
    ),
  ];

  const homeFleetCount =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — homeFleetCount unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter((vehicle) => vehicle.homeStationId === input.stationId).length,
          vehicleReasons,
        );

  const currentOnSiteCount =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — currentOnSiteCount unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter((vehicle) => isOnSiteAtStation(vehicle, input.stationId)).length,
          vehicleReasons,
        );

  const foreignVehiclesOnSiteCount =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — foreignVehiclesOnSiteCount unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter((vehicle) => isForeignVehicleOnSite(vehicle, input.stationId))
            .length,
          vehicleReasons,
        );

  const expectedArrivalCount =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — expectedArrivalCount unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter((vehicle) => isExpectedArrival(vehicle, input.stationId)).length,
          vehicleReasons,
        );

  const currentlyRentedHomeVehicles =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — currentlyRentedHomeVehicles unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter(
            (vehicle) =>
              vehicle.homeStationId === input.stationId &&
              vehicle.status === VehicleStatus.RENTED,
          ).length,
          [
            ...vehicleReasons,
            reason(
              StationKpiReasonCode.DEPRECATED_BOOKED_VEHICLES,
              'Do not use bookedVehicles for RENTED count — use currentlyRentedHomeVehicles.',
            ),
          ],
        );

  const readyToRentOnSite =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — readyToRentOnSite unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter(
            (vehicle) =>
              isOnSiteAtStation(vehicle, input.stationId) &&
              vehicle.status === VehicleStatus.AVAILABLE,
          ).length,
          vehicleReasons,
        );

  const blockedOrMaintenanceOnSite =
    vehicles == null
      ? unknownMetric<number>([
          ...vehicleReasons,
          reason(
            StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
            'Vehicle snapshot missing — blockedOrMaintenanceOnSite unknown.',
          ),
        ])
      : knownMetric(
          vehicles.filter(
            (vehicle) =>
              isOnSiteAtStation(vehicle, input.stationId) &&
              (vehicle.status === VehicleStatus.IN_SERVICE ||
                vehicle.status === VehicleStatus.OUT_OF_SERVICE),
          ).length,
          vehicleReasons,
        );

  const bookingReasons = [
    ...scopeReasons,
    reason(
      StationKpiReasonCode.STATION_TIMEZONE_USED,
      `pickupsToday/returnsToday use calendar day ${dayWindow.dateOnly}.`,
    ),
  ];

  const pickupsToday =
    bookings == null
      ? unknownMetric<number>([
          ...bookingReasons,
          reason(
            StationKpiReasonCode.BOOKING_SNAPSHOT_MISSING,
            'Booking snapshot missing — pickupsToday unknown.',
          ),
        ])
      : knownMetric(
          bookings.filter((booking) => {
            if (booking.pickupStationId !== input.stationId) return false;
            if (!isActiveBookingStatus(booking.status)) return false;
            return isWithinInclusiveRange(
              parseInstant(booking.startDate),
              dayWindow.todayStart,
              dayWindow.todayEnd,
            );
          }).length,
          bookingReasons,
        );

  const returnsToday =
    bookings == null
      ? unknownMetric<number>([
          ...bookingReasons,
          reason(
            StationKpiReasonCode.BOOKING_SNAPSHOT_MISSING,
            'Booking snapshot missing — returnsToday unknown.',
          ),
        ])
      : knownMetric(
          bookings.filter((booking) => {
            if (booking.returnStationId !== input.stationId) return false;
            if (!isActiveBookingStatus(booking.status)) return false;
            return isWithinInclusiveRange(
              parseInstant(booking.endDate),
              dayWindow.todayStart,
              dayWindow.todayEnd,
            );
          }).length,
          bookingReasons,
        );

  const overdueReturns =
    bookings == null
      ? unknownMetric<number>([
          ...bookingReasons,
          reason(
            StationKpiReasonCode.BOOKING_SNAPSHOT_MISSING,
            'Booking snapshot missing — overdueReturns unknown.',
          ),
        ])
      : knownMetric(
          bookings.filter((booking) => {
            if (booking.status !== 'ACTIVE') return false;
            if (booking.returnStationId !== input.stationId) return false;
            return parseInstant(booking.endDate).getTime() < evaluatedAt.getTime();
          }).length,
          bookingReasons,
        );

  const transferReasons = [...scopeReasons];

  const incomingTransfers =
    transfers == null
      ? unknownMetric<number>([
          ...transferReasons,
          reason(
            StationKpiReasonCode.TRANSFER_SNAPSHOT_MISSING,
            'Transfer snapshot missing — incomingTransfers unknown.',
          ),
        ])
      : knownMetric(
          transfers.filter(
            (transfer) =>
              transfer.toStationId === input.stationId &&
              isActiveTransferStatus(transfer.status),
          ).length,
          transferReasons,
        );

  const outgoingTransfers =
    transfers == null
      ? unknownMetric<number>([
          ...transferReasons,
          reason(
            StationKpiReasonCode.TRANSFER_SNAPSHOT_MISSING,
            'Transfer snapshot missing — outgoingTransfers unknown.',
          ),
        ])
      : knownMetric(
          transfers.filter(
            (transfer) =>
              transfer.fromStationId === input.stationId &&
              isActiveTransferStatus(transfer.status),
          ).length,
          transferReasons,
        );

  const openOperationalTasks =
    input.openOperationalTasksCount == null
      ? unknownMetric<number>([
          ...scopeReasons,
          reason(
            StationKpiReasonCode.TASK_COUNT_MISSING,
            'Open operational task count not provided.',
          ),
        ])
      : knownMetric(input.openOperationalTasksCount, scopeReasons);

  const capacityStatus = (() => {
    if (vehicles == null) {
      return unknownMetric<string>([
        ...vehicleReasons,
        reason(
          StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING,
          'Vehicle snapshot missing — capacityStatus unknown.',
        ),
      ]) as StationKpiMetric<StationCapacityStatus>;
    }

    const capacity = evaluateStationCapacityPolicy({
      stationId: input.stationId,
      configuredCapacity: input.configuredCapacity,
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        homeStationId: vehicle.homeStationId,
        currentStationId: vehicle.currentStationId,
        expectedStationId: vehicle.expectedStationId,
        status: vehicle.status,
      })),
    });

    const reasons = [...vehicleReasons];
    if (capacity.projectedOccupancy == null) {
      reasons.push(
        reason(
          StationKpiReasonCode.CAPACITY_PARTIAL,
          'Capacity projection partially unknown — status may omit projected over-capacity.',
        ),
      );
    }

    return {
      value: capacity.capacityStatus,
      known: true,
      partial: capacity.projectedOccupancy == null,
      reasons,
    } satisfies StationKpiMetric<StationCapacityStatus>;
  })();

  return {
    version: STATION_KPIS_VERSION,
    stationId: input.stationId,
    evaluatedAt: input.evaluatedAt,
    timezone: input.timezone,
    calendarDay: dayWindow.dateOnly,
    scope: input.scope,
    metrics: {
      homeFleetCount,
      currentOnSiteCount,
      foreignVehiclesOnSiteCount,
      expectedArrivalCount,
      currentlyRentedHomeVehicles,
      readyToRentOnSite,
      blockedOrMaintenanceOnSite,
      pickupsToday,
      returnsToday,
      overdueReturns,
      incomingTransfers,
      outgoingTransfers,
      openOperationalTasks,
      capacityStatus,
    },
    deprecatedAliases: {
      bookedVehicles: null,
    },
  };
}

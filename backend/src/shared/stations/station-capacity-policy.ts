import { VehicleStatus } from '@prisma/client';
import {
  getStationCapacityPolicyContractMetadata,
  STATION_CAPACITY_NEAR_RATIO,
  STATION_CAPACITY_POLICY_VERSION,
  StationCapacityPolicyReasonCode,
  StationCapacityStatus,
} from './station-capacity-policy.contract';

export * from './station-capacity-policy.contract';

export interface StationCapacityVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  status: VehicleStatus;
}

export interface StationCapacityBookingProjection {
  /** Expected vehicle returns to this station (unknown when null). */
  expectedReturnArrivals?: number | null;
  /** Expected vehicle pickups leaving this station (unknown when null). */
  expectedPickupDepartures?: number | null;
}

export interface StationCapacityPolicyInput {
  stationId: string;
  configuredCapacity: number | null;
  vehicles: StationCapacityVehicleSnapshot[];
  bookingProjection?: StationCapacityBookingProjection;
  nearCapacityRatio?: number;
}

export interface StationCapacityPolicyReason {
  code: StationCapacityPolicyReasonCode;
  message: string;
}

export interface StationCapacityOccupancyBreakdown {
  foreignOnSiteCount: number;
  homeOnSiteCount: number;
  rentedHomeExcludedCount: number;
}

export interface StationCapacityPolicyResult {
  policyVersion: typeof STATION_CAPACITY_POLICY_VERSION;
  stationId: string;
  configuredCapacity: number | null;
  currentOnSiteCount: number;
  expectedTransferArrivalCount: number;
  expectedReturnArrivalCount: number | null;
  expectedArrivalCount: number | null;
  expectedTransferDepartureCount: number;
  expectedPickupDepartureCount: number | null;
  expectedDepartureCount: number | null;
  projectedOccupancy: number | null;
  availablePhysicalSlots: number | null;
  capacityStatus: StationCapacityStatus;
  reasons: StationCapacityPolicyReason[];
  breakdown: StationCapacityOccupancyBreakdown;
}

function reason(
  code: StationCapacityPolicyReasonCode,
  message: string,
): StationCapacityPolicyReason {
  return { code, message };
}

export function vehicleCountsTowardStationCapacity(
  vehicle: StationCapacityVehicleSnapshot,
  stationId: string,
): boolean {
  if (vehicle.currentStationId !== stationId) return false;
  if (vehicle.homeStationId === stationId && vehicle.status === VehicleStatus.RENTED) {
    return false;
  }
  return true;
}

export function isForeignVehicleOnSite(
  vehicle: StationCapacityVehicleSnapshot,
  stationId: string,
): boolean {
  return (
    vehicle.currentStationId === stationId &&
    vehicle.homeStationId != null &&
    vehicle.homeStationId !== stationId &&
    vehicleCountsTowardStationCapacity(vehicle, stationId)
  );
}

function countCurrentOnSite(
  vehicles: StationCapacityVehicleSnapshot[],
  stationId: string,
): { count: number; breakdown: StationCapacityOccupancyBreakdown } {
  const breakdown: StationCapacityOccupancyBreakdown = {
    foreignOnSiteCount: 0,
    homeOnSiteCount: 0,
    rentedHomeExcludedCount: 0,
  };

  let count = 0;
  for (const vehicle of vehicles) {
    if (vehicle.currentStationId !== stationId) continue;
    if (vehicle.homeStationId === stationId && vehicle.status === VehicleStatus.RENTED) {
      breakdown.rentedHomeExcludedCount += 1;
      continue;
    }
    count += 1;
    if (vehicle.homeStationId === stationId) {
      breakdown.homeOnSiteCount += 1;
    } else if (vehicle.homeStationId != null && vehicle.homeStationId !== stationId) {
      breakdown.foreignOnSiteCount += 1;
    }
  }

  return { count, breakdown };
}

function countExpectedTransferArrivals(
  vehicles: StationCapacityVehicleSnapshot[],
  stationId: string,
): number {
  return vehicles.filter(
    (vehicle) =>
      vehicle.expectedStationId === stationId &&
      vehicle.currentStationId !== stationId,
  ).length;
}

function countExpectedTransferDepartures(
  vehicles: StationCapacityVehicleSnapshot[],
  stationId: string,
): number {
  return vehicles.filter(
    (vehicle) =>
      vehicle.currentStationId === stationId &&
      vehicle.expectedStationId != null &&
      vehicle.expectedStationId !== stationId &&
      vehicleCountsTowardStationCapacity(vehicle, stationId),
  ).length;
}

function addNullable(left: number, right: number | null | undefined): number | null {
  if (right == null) return null;
  return left + right;
}

function subtractNullable(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  return left - right;
}

export function resolveStationCapacityStatus(
  configuredCapacity: number | null,
  currentOnSiteCount: number,
  projectedOccupancy: number | null,
  nearCapacityRatio: number = STATION_CAPACITY_NEAR_RATIO,
): StationCapacityStatus {
  if (configuredCapacity == null) {
    return StationCapacityStatus.UNKNOWN;
  }

  if (currentOnSiteCount > configuredCapacity) {
    return StationCapacityStatus.OVER_CAPACITY;
  }

  if (projectedOccupancy != null && projectedOccupancy > configuredCapacity) {
    return StationCapacityStatus.PROJECTED_OVER_CAPACITY;
  }

  if (currentOnSiteCount >= configuredCapacity) {
    return StationCapacityStatus.FULL;
  }

  if (projectedOccupancy != null && projectedOccupancy >= configuredCapacity) {
    return StationCapacityStatus.FULL;
  }

  const nearThreshold = Math.max(1, Math.ceil(configuredCapacity * nearCapacityRatio));
  if (currentOnSiteCount >= nearThreshold) {
    return StationCapacityStatus.NEAR_CAPACITY;
  }

  if (projectedOccupancy != null && projectedOccupancy >= nearThreshold) {
    return StationCapacityStatus.NEAR_CAPACITY;
  }

  return StationCapacityStatus.AVAILABLE;
}

export function evaluateStationCapacityPolicy(
  input: StationCapacityPolicyInput,
): StationCapacityPolicyResult {
  const reasons: StationCapacityPolicyReason[] = [
    reason(
      StationCapacityPolicyReasonCode.PHYSICAL_PRESENCE_BASIS,
      'Occupancy is based on confirmed physical presence (currentStationId).',
    ),
    reason(
      StationCapacityPolicyReasonCode.HOME_FLEET_EXCLUDED,
      'Home fleet size does not define current occupancy.',
    ),
  ];

  const { count: currentOnSiteCount, breakdown } = countCurrentOnSite(
    input.vehicles,
    input.stationId,
  );

  if (breakdown.foreignOnSiteCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.FOREIGN_VEHICLE_INCLUDED,
        `${breakdown.foreignOnSiteCount} foreign vehicle(s) on site count toward capacity.`,
      ),
    );
  }

  if (breakdown.rentedHomeExcludedCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.RENTED_HOME_VEHICLE_EXCLUDED,
        `${breakdown.rentedHomeExcludedCount} rented home vehicle(s) excluded from on-site occupancy.`,
      ),
    );
  }

  const expectedTransferArrivalCount = countExpectedTransferArrivals(
    input.vehicles,
    input.stationId,
  );
  if (expectedTransferArrivalCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.EXPECTED_TRANSFER_ARRIVAL,
        `${expectedTransferArrivalCount} expected transfer arrival(s).`,
      ),
    );
  }

  const expectedReturnArrivalCount =
    input.bookingProjection?.expectedReturnArrivals ?? null;
  if (expectedReturnArrivalCount != null && expectedReturnArrivalCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.EXPECTED_RETURN_ARRIVAL,
        `${expectedReturnArrivalCount} expected return arrival(s) from bookings.`,
      ),
    );
  }

  const expectedTransferDepartureCount = countExpectedTransferDepartures(
    input.vehicles,
    input.stationId,
  );
  if (expectedTransferDepartureCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.EXPECTED_TRANSFER_DEPARTURE,
        `${expectedTransferDepartureCount} expected transfer departure(s).`,
      ),
    );
  }

  const expectedPickupDepartureCount =
    input.bookingProjection?.expectedPickupDepartures ?? null;
  if (expectedPickupDepartureCount != null && expectedPickupDepartureCount > 0) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.EXPECTED_PICKUP_DEPARTURE,
        `${expectedPickupDepartureCount} expected pickup departure(s) from bookings.`,
      ),
    );
  }

  const expectedArrivalCount = addNullable(
    expectedTransferArrivalCount,
    expectedReturnArrivalCount,
  );
  const expectedDepartureCount = addNullable(
    expectedTransferDepartureCount,
    expectedPickupDepartureCount,
  );

  let projectedOccupancy: number | null = null;
  if (expectedArrivalCount != null && expectedDepartureCount != null) {
    projectedOccupancy = currentOnSiteCount + expectedArrivalCount - expectedDepartureCount;
  } else if (expectedArrivalCount == null && expectedDepartureCount == null) {
    projectedOccupancy = currentOnSiteCount;
  } else {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.PROJECTION_PARTIAL_UNKNOWN,
        'Projected occupancy is unknown because booking-based arrivals or departures are missing.',
      ),
    );
  }

  const availablePhysicalSlots =
    input.configuredCapacity == null
      ? null
      : input.configuredCapacity - currentOnSiteCount;

  if (input.configuredCapacity == null) {
    reasons.push(
      reason(
        StationCapacityPolicyReasonCode.CAPACITY_NOT_CONFIGURED,
        'Station capacity is not configured; status is UNKNOWN.',
      ),
    );
  }

  const capacityStatus = resolveStationCapacityStatus(
    input.configuredCapacity,
    currentOnSiteCount,
    projectedOccupancy,
    input.nearCapacityRatio,
  );

  return {
    policyVersion: STATION_CAPACITY_POLICY_VERSION,
    stationId: input.stationId,
    configuredCapacity: input.configuredCapacity,
    currentOnSiteCount,
    expectedTransferArrivalCount,
    expectedReturnArrivalCount,
    expectedArrivalCount,
    expectedTransferDepartureCount,
    expectedPickupDepartureCount,
    expectedDepartureCount,
    projectedOccupancy,
    availablePhysicalSlots,
    capacityStatus,
    reasons,
    breakdown,
  };
}

export function getStationCapacityPolicyMetadata() {
  return getStationCapacityPolicyContractMetadata();
}

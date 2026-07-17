export const STATION_CAPACITY_POLICY_VERSION = 1 as const;

export const StationCapacityStatus = {
  UNKNOWN: 'UNKNOWN',
  AVAILABLE: 'AVAILABLE',
  NEAR_CAPACITY: 'NEAR_CAPACITY',
  FULL: 'FULL',
  OVER_CAPACITY: 'OVER_CAPACITY',
  PROJECTED_OVER_CAPACITY: 'PROJECTED_OVER_CAPACITY',
} as const;

export type StationCapacityStatus =
  (typeof StationCapacityStatus)[keyof typeof StationCapacityStatus];

export const StationCapacityPolicyReasonCode = {
  CAPACITY_NOT_CONFIGURED: 'STATION_CAPACITY_NOT_CONFIGURED',
  PHYSICAL_PRESENCE_BASIS: 'STATION_CAPACITY_PHYSICAL_PRESENCE_BASIS',
  HOME_FLEET_EXCLUDED: 'STATION_CAPACITY_HOME_FLEET_EXCLUDED',
  RENTED_HOME_VEHICLE_EXCLUDED: 'STATION_CAPACITY_RENTED_HOME_VEHICLE_EXCLUDED',
  FOREIGN_VEHICLE_INCLUDED: 'STATION_CAPACITY_FOREIGN_VEHICLE_INCLUDED',
  EXPECTED_TRANSFER_ARRIVAL: 'STATION_CAPACITY_EXPECTED_TRANSFER_ARRIVAL',
  EXPECTED_RETURN_ARRIVAL: 'STATION_CAPACITY_EXPECTED_RETURN_ARRIVAL',
  EXPECTED_TRANSFER_DEPARTURE: 'STATION_CAPACITY_EXPECTED_TRANSFER_DEPARTURE',
  EXPECTED_PICKUP_DEPARTURE: 'STATION_CAPACITY_EXPECTED_PICKUP_DEPARTURE',
  PROJECTION_PARTIAL_UNKNOWN: 'STATION_CAPACITY_PROJECTION_PARTIAL_UNKNOWN',
} as const;

export type StationCapacityPolicyReasonCode =
  (typeof StationCapacityPolicyReasonCode)[keyof typeof StationCapacityPolicyReasonCode];

export interface StationCapacityPolicyContractMetadata {
  version: typeof STATION_CAPACITY_POLICY_VERSION;
  basis: 'physical_presence';
  homeFleetCountsTowardOccupancy: false;
  rentedHomeVehiclesBlockSlot: false;
  foreignVehiclesOnSiteCount: true;
  nullMeansUnknown: true;
  bookingBlocking: false;
  statuses: StationCapacityStatus[];
  metrics: readonly string[];
}

export function getStationCapacityPolicyContractMetadata(): StationCapacityPolicyContractMetadata {
  return {
    version: STATION_CAPACITY_POLICY_VERSION,
    basis: 'physical_presence',
    homeFleetCountsTowardOccupancy: false,
    rentedHomeVehiclesBlockSlot: false,
    foreignVehiclesOnSiteCount: true,
    nullMeansUnknown: true,
    bookingBlocking: false,
    statuses: Object.values(StationCapacityStatus),
    metrics: [
      'configuredCapacity',
      'currentOnSiteCount',
      'expectedArrivalCount',
      'expectedDepartureCount',
      'projectedOccupancy',
      'availablePhysicalSlots',
      'capacityStatus',
    ],
  };
}

/** Default ratio at or above which status becomes NEAR_CAPACITY. */
export const STATION_CAPACITY_NEAR_RATIO = 0.8;

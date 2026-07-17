import { VehicleStatus } from '@prisma/client';
import {
  evaluateStationCapacityPolicy,
  isForeignVehicleOnSite,
  resolveStationCapacityStatus,
  StationCapacityStatus,
  vehicleCountsTowardStationCapacity,
} from './station-capacity-policy';
import { getStationCapacityPolicyContractMetadata } from './station-capacity-policy.contract';

const STATION = 'station-a';
const OTHER = 'station-b';

function vehicle(
  id: string,
  partial: Partial<{
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
    status: VehicleStatus;
  }> = {},
) {
  return {
    id,
    homeStationId:
      'homeStationId' in partial ? (partial.homeStationId ?? null) : STATION,
    currentStationId:
      'currentStationId' in partial ? (partial.currentStationId ?? null) : STATION,
    expectedStationId:
      'expectedStationId' in partial ? (partial.expectedStationId ?? null) : null,
    status: partial.status ?? VehicleStatus.AVAILABLE,
  };
}

describe('station-capacity-policy', () => {
  describe('contract metadata', () => {
    it('documents physical-presence basis and no booking blocking', () => {
      const metadata = getStationCapacityPolicyContractMetadata();
      expect(metadata.basis).toBe('physical_presence');
      expect(metadata.homeFleetCountsTowardOccupancy).toBe(false);
      expect(metadata.bookingBlocking).toBe(false);
    });
  });

  describe('current on-site occupancy', () => {
    it('counts physically present non-rented home vehicles', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [vehicle('v1'), vehicle('v2')],
      });
      expect(result.currentOnSiteCount).toBe(2);
      expect(result.breakdown.homeOnSiteCount).toBe(2);
    });

    it('does not count home fleet vehicles that are not physically on site', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [
          vehicle('v1', { currentStationId: OTHER }),
          vehicle('v2', { currentStationId: null }),
        ],
      });
      expect(result.currentOnSiteCount).toBe(0);
    });

    it('excludes rented home vehicles from on-site occupancy', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [
          vehicle('v1', { status: VehicleStatus.RENTED, currentStationId: STATION }),
          vehicle('v2', { status: VehicleStatus.AVAILABLE, currentStationId: STATION }),
        ],
      });
      expect(result.currentOnSiteCount).toBe(1);
      expect(result.breakdown.rentedHomeExcludedCount).toBe(1);
    });

    it('counts foreign vehicles physically on site', () => {
      const vehicles = [
        vehicle('foreign', {
          homeStationId: OTHER,
          currentStationId: STATION,
          status: VehicleStatus.AVAILABLE,
        }),
      ];
      expect(isForeignVehicleOnSite(vehicles[0], STATION)).toBe(true);
      expect(vehicleCountsTowardStationCapacity(vehicles[0], STATION)).toBe(true);

      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 5,
        vehicles,
      });
      expect(result.currentOnSiteCount).toBe(1);
      expect(result.breakdown.foreignOnSiteCount).toBe(1);
    });

    it('counts foreign rented vehicles on site', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 5,
        vehicles: [
          vehicle('foreign-rented', {
            homeStationId: OTHER,
            currentStationId: STATION,
            status: VehicleStatus.RENTED,
          }),
        ],
      });
      expect(result.currentOnSiteCount).toBe(1);
    });
  });

  describe('expected arrivals and departures', () => {
    it('tracks transfer arrivals separately from booking returns', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [
          vehicle('on-site', { currentStationId: STATION }),
          vehicle('incoming', {
            currentStationId: OTHER,
            expectedStationId: STATION,
          }),
        ],
        bookingProjection: { expectedReturnArrivals: 2, expectedPickupDepartures: 1 },
      });
      expect(result.expectedTransferArrivalCount).toBe(1);
      expect(result.expectedReturnArrivalCount).toBe(2);
      expect(result.expectedArrivalCount).toBe(3);
      expect(result.expectedPickupDepartureCount).toBe(1);
    });

    it('tracks transfer departures for vehicles on site expected elsewhere', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [
          vehicle('leaving', {
            currentStationId: STATION,
            expectedStationId: OTHER,
          }),
        ],
        bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
      });
      expect(result.expectedTransferDepartureCount).toBe(1);
      expect(result.expectedDepartureCount).toBe(1);
      expect(result.projectedOccupancy).toBe(0);
    });
  });

  describe('null means unknown', () => {
    it('returns UNKNOWN status when capacity is not configured', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: null,
        vehicles: [vehicle('v1')],
      });
      expect(result.capacityStatus).toBe(StationCapacityStatus.UNKNOWN);
      expect(result.availablePhysicalSlots).toBeNull();
    });

    it('leaves projected occupancy null when booking projection is partial', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [vehicle('v1')],
        bookingProjection: { expectedReturnArrivals: null, expectedPickupDepartures: 0 },
      });
      expect(result.expectedReturnArrivalCount).toBeNull();
      expect(result.expectedArrivalCount).toBeNull();
      expect(result.projectedOccupancy).toBeNull();
    });

    it('does not treat null booking returns as zero in expectedArrivalCount', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [
          vehicle('transfer', { currentStationId: OTHER, expectedStationId: STATION }),
        ],
        bookingProjection: { expectedReturnArrivals: null },
      });
      expect(result.expectedTransferArrivalCount).toBe(1);
      expect(result.expectedArrivalCount).toBeNull();
    });
  });

  describe('capacity status', () => {
    it('returns AVAILABLE with spare slots', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 10,
        vehicles: [vehicle('v1')],
        bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
      });
      expect(result.capacityStatus).toBe(StationCapacityStatus.AVAILABLE);
      expect(result.availablePhysicalSlots).toBe(9);
      expect(result.projectedOccupancy).toBe(1);
    });

    it('returns FULL when physically at capacity', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 2,
        vehicles: [vehicle('v1'), vehicle('v2')],
        bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
      });
      expect(result.capacityStatus).toBe(StationCapacityStatus.FULL);
      expect(result.availablePhysicalSlots).toBe(0);
    });

    it('returns OVER_CAPACITY when more vehicles on site than configured', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 2,
        vehicles: [vehicle('v1'), vehicle('v2'), vehicle('v3')],
        bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
      });
      expect(result.capacityStatus).toBe(StationCapacityStatus.OVER_CAPACITY);
    });

    it('returns PROJECTED_OVER_CAPACITY when future occupancy exceeds capacity', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 3,
        vehicles: [
          vehicle('v1'),
          vehicle('v2'),
          vehicle('incoming-1', { currentStationId: OTHER, expectedStationId: STATION }),
          vehicle('incoming-2', { currentStationId: OTHER, expectedStationId: STATION }),
        ],
        bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
      });
      expect(result.currentOnSiteCount).toBe(2);
      expect(result.projectedOccupancy).toBe(4);
      expect(result.capacityStatus).toBe(StationCapacityStatus.PROJECTED_OVER_CAPACITY);
    });

    it('returns NEAR_CAPACITY near threshold', () => {
      expect(
        resolveStationCapacityStatus(10, 8, 8, 0.8),
      ).toBe(StationCapacityStatus.NEAR_CAPACITY);
    });
  });

  describe('typical constellation: busy station with mixed fleet', () => {
    it('combines foreign on site, rented home excluded, and incoming transfers', () => {
      const result = evaluateStationCapacityPolicy({
        stationId: STATION,
        configuredCapacity: 6,
        vehicles: [
          vehicle('home-available', { currentStationId: STATION }),
          vehicle('home-rented-away', {
            currentStationId: STATION,
            status: VehicleStatus.RENTED,
          }),
          vehicle('home-away-rented', {
            currentStationId: OTHER,
            status: VehicleStatus.RENTED,
          }),
          vehicle('foreign-on-site', {
            homeStationId: OTHER,
            currentStationId: STATION,
          }),
          vehicle('transfer-in', {
            homeStationId: OTHER,
            currentStationId: OTHER,
            expectedStationId: STATION,
          }),
          vehicle('transfer-out', {
            currentStationId: STATION,
            expectedStationId: OTHER,
          }),
        ],
        bookingProjection: { expectedReturnArrivals: 1, expectedPickupDepartures: 1 },
      });

      expect(result.currentOnSiteCount).toBe(3);
      expect(result.breakdown.homeOnSiteCount).toBe(2);
      expect(result.breakdown.foreignOnSiteCount).toBe(1);
      expect(result.breakdown.rentedHomeExcludedCount).toBe(1);
      expect(result.expectedTransferArrivalCount).toBe(1);
      expect(result.expectedArrivalCount).toBe(2);
      expect(result.expectedTransferDepartureCount).toBe(1);
      expect(result.expectedDepartureCount).toBe(2);
      expect(result.projectedOccupancy).toBe(3);
      expect(result.availablePhysicalSlots).toBe(3);
      expect(result.capacityStatus).toBe(StationCapacityStatus.AVAILABLE);
    });
  });
});

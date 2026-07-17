import { StationStatus, VehicleStatus } from '@prisma/client';
import {
  resolveStationOperations,
  StationAfterHoursCapabilityStatus,
  StationKeyboxStatus,
  StationOpeningStatus,
} from './station-operations.resolver';
import { StationOperationalCapabilityKind } from './station-operational-capability.resolver';
import { StationCapacityStatus } from './station-capacity-policy';
import { StationGeofenceCapabilityStatus } from './station-geofence-capability.contract';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';
import { getStationOperationsContractMetadata } from './station-operations.contract';

const BERLIN = 'Europe/Berlin';
const ORG = 'org-1';
const STATION = 'station-1';

const BASE_SNAPSHOT = {
  stationId: STATION,
  organizationId: ORG,
  status: 'ACTIVE' as StationStatus,
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: true,
  keyBoxAvailable: true,
  timezone: BERLIN,
  openingHours: {
    version: 2,
    monday: { slots: [{ open: '09:00', close: '18:00' }] },
    tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    wednesday: { slots: [{ open: '09:00', close: '18:00' }] },
    thursday: { slots: [{ open: '09:00', close: '18:00' }] },
    friday: { slots: [{ open: '09:00', close: '18:00' }] },
    saturday: { closed: true },
    sunday: { closed: true },
  },
  calendarExceptions: [],
  temporaryOperationalRules: [],
  latitude: 52.52,
  longitude: 13.405,
  radiusMeters: 150,
  capacity: 10,
  vehicles: [
    {
      id: 'v1',
      homeStationId: STATION,
      currentStationId: STATION,
      expectedStationId: null,
      status: VehicleStatus.AVAILABLE,
    },
  ],
};

describe('station-operations.resolver', () => {
  describe('contract metadata', () => {
    it('documents central backend resolver without frontend recomputation', () => {
      const metadata = getStationOperationsContractMetadata();
      expect(metadata.frontendRecomputation).toBe(false);
      expect(metadata.sections).toContain('geofenceCapability');
      expect(metadata.sections).toContain('configurationProblems');
    });
  });

  describe('resolveStationOperations', () => {
    it('returns canonical sections during opening hours', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
      const result = resolveStationOperations(BASE_SNAPSHOT, { at });

      expect(result.stationId).toBe(STATION);
      expect(result.organizationId).toBe(ORG);
      expect(result.operationsVersion).toBe(1);
      expect(result.currentStationTime.timezone).toBe(BERLIN);
      expect(result.currentStationTime.localTime).toBe('10:00');
      expect(result.openingStatus.status).toBe(StationOpeningStatus.OPEN);
      expect(result.pickupCapability.kind).toBe(StationOperationalCapabilityKind.PICKUP_AVAILABLE);
      expect(result.returnCapability.kind).toBe(StationOperationalCapabilityKind.RETURN_AVAILABLE);
      expect(result.keyboxStatus.status).toBe(StationKeyboxStatus.AVAILABLE);
      expect(result.capacityStatus.status).toBe(StationCapacityStatus.AVAILABLE);
      expect(result.geofenceCapability.status).toBe(StationGeofenceCapabilityStatus.CONFIGURED_ONLY);
      expect(result.geofenceCapability.writesCurrentStationId).toBe(false);
    });

    it('marks station closed outside opening hours and exposes next opening window', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!;
      const result = resolveStationOperations(BASE_SNAPSHOT, { at });

      expect(result.openingStatus.status).toBe(StationOpeningStatus.CLOSED);
      expect(result.pickupCapability.available).toBe(false);
      expect(result.nextOpeningWindow).not.toBeNull();
      expect(result.afterHoursCapability.status).toBe(StationAfterHoursCapabilityStatus.AVAILABLE);
    });

    it('surfaces configuration problems for missing data transparently', () => {
      const result = resolveStationOperations(
        {
          ...BASE_SNAPSHOT,
          latitude: null,
          longitude: null,
          radiusMeters: null,
          capacity: null,
          openingHours: null,
          timezone: null,
        },
        { at: '2026-07-14T10:00:00.000Z' },
      );

      expect(result.openingStatus.status).toBe(StationOpeningStatus.UNKNOWN);
      expect(result.configurationProblems.length).toBeGreaterThanOrEqual(4);
      expect(result.geofenceCapability.status).toBe(StationGeofenceCapabilityStatus.NOT_CONFIGURED);
      expect(
        result.configurationProblems.some((item) => item.code === 'STATION_OPERATIONS_COORDINATES_MISSING'),
      ).toBe(true);
    });

    it('includes active calendar exception and operational warning for closure', () => {
      const result = resolveStationOperations(
        {
          ...BASE_SNAPSHOT,
          calendarExceptions: [
            {
              id: 'exc-1',
              type: 'STATION_CLOSURE',
              title: 'Betriebsferien',
              recurrenceKind: 'NONE',
              calendarDate: '2026-07-14',
              closedAllDay: true,
              priority: 10,
            },
          ],
        },
        { at: zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)! },
      );

      expect(result.calendarException.active).toBe(true);
      expect(result.calendarException.exception?.title).toBe('Betriebsferien');
      expect(
        result.operationalWarnings.some(
          (item) => item.code === 'STATION_OPERATIONS_CALENDAR_EXCEPTION_ACTIVE',
        ),
      ).toBe(true);
    });

    it('warns when physical capacity is exceeded', () => {
      const vehicles = Array.from({ length: 11 }, (_, index) => ({
        id: `v-${index}`,
        homeStationId: STATION,
        currentStationId: STATION,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      }));

      const result = resolveStationOperations(
        { ...BASE_SNAPSHOT, vehicles },
        { at: zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)! },
      );

      expect(result.capacityStatus.status).toBe(StationCapacityStatus.OVER_CAPACITY);
      expect(
        result.operationalWarnings.some((item) => item.code === 'STATION_OPERATIONS_CAPACITY_OVER'),
      ).toBe(true);
    });
  });
});

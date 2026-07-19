/**
 * Fleet connectivity state regressions: freshness thresholds (H),
 * provider link (J), readiness/coverage (K), API contract cross-checks.
 */
import { DimoConnectionStatus } from '@prisma/client';
import { classifyTelemetryFreshness as backendClassifyFreshness } from './vehicle-state-interpreter';
import {
  deriveConnectionStatus,
  deriveFleetSignals,
  mapFleetConnectivityVehicle,
  ONLINE_MAX_MS,
  STANDBY_MAX_MS,
  SIGNAL_DELAYED_MAX_MS,
} from './fleet-connectivity.util';
import { VehiclesService } from './vehicles.service';
import { buildFleetDeviceConnectionFields } from '@modules/dimo/device-connection-read-model';
import { buildDeviceConnectionSummary } from '@modules/dimo/device-connection-read-model';
import { DimoDeviceConnectionEventType } from '@prisma/client';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

function hoursAgo(h: number): Date {
  return new Date(NOW - h * 3_600_000);
}

function minutesAgo(m: number): Date {
  return new Date(NOW - m * 60_000);
}

const baseVehicleInput = {
  id: 'v-state-1',
  vin: 'WVWZZZ1JZXW000099',
  licensePlate: 'B-FC 99',
  make: 'VW',
  model: 'Golf',
  year: 2022,
  homeStation: { name: 'Berlin' },
};

describe('connectivity state regressions (H–K)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('H — freshness thresholds (canonical unified across fleet API)', () => {
    const cases: Array<{
      label: string;
      lastSeen: Date | null;
      canonical: ReturnType<typeof backendClassifyFreshness>;
      fleetStatus: ReturnType<typeof deriveConnectionStatus>['connectionStatus'];
      fleetFreshness: ReturnType<typeof deriveConnectionStatus>['telemetryFreshness'];
    }> = [
      {
        label: 'live (<15m)',
        lastSeen: minutesAgo(5),
        canonical: 'live',
        fleetStatus: 'online',
        fleetFreshness: 'live',
      },
      {
        label: 'standby (15m–24h)',
        lastSeen: hoursAgo(3),
        canonical: 'standby',
        fleetStatus: 'standby',
        fleetFreshness: 'standby',
      },
      {
        label: 'soft-offline / signal_delayed (24–48h)',
        lastSeen: hoursAgo(30),
        canonical: 'signal_delayed',
        fleetStatus: 'signal_delayed',
        fleetFreshness: 'signal_delayed',
      },
      {
        label: 'offline (≥48h)',
        lastSeen: hoursAgo(50),
        canonical: 'offline',
        fleetStatus: 'offline',
        fleetFreshness: 'offline',
      },
      {
        label: 'unknown / no timestamp',
        lastSeen: null,
        canonical: 'no_signal',
        fleetStatus: 'offline',
        fleetFreshness: 'no_signal',
      },
    ];

    it.each(cases)(
      '$label — fleet API matches canonical freshness',
      ({ lastSeen, canonical, fleetStatus, fleetFreshness }) => {
        expect(backendClassifyFreshness(lastSeen, NOW)).toBe(canonical);

        const fleet = deriveConnectionStatus(
          true,
          lastSeen ? { providerObservedAt: lastSeen } : {},
          NOW,
        );
        expect(fleet.connectionStatus).toBe(fleetStatus);
        expect(fleet.telemetryFreshness).toBe(fleetFreshness);
      },
    );

    it('verifies agreed threshold constants', () => {
      expect(ONLINE_MAX_MS).toBe(15 * 60 * 1000);
      expect(STANDBY_MAX_MS).toBe(24 * 60 * 60 * 1000);
      expect(SIGNAL_DELAYED_MAX_MS).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('J — provider link with expired authorization (FC-P1-03)', () => {
    it('CURRENT: DimoVehicle presence alone counts as full provider link', () => {
      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicleInput,
          dimoVehicle: {
            tokenId: 12345,
            lastSignal: minutesAgo(5),
            syncedAt: minutesAgo(5),
            createdAt: new Date('2026-01-01'),
            rawJson: {},
          },
          latestState: {
            lastSeenAt: minutesAgo(5),
            sourceTimestamp: minutesAgo(5),
            providerFetchedAt: minutesAgo(5),
            latitude: 52.5,
            longitude: 13.4,
            speedKmh: 0,
            odometerKm: 1000,
            fuelLevelRelative: 0.5,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: {},
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      // TARGET (Prompt 7): consent/authorization expiry degrades provider link truth
      expect(mapped.connectionStatus).toBe('online');
      expect(mapped.provider).toBe('DIMO');
      expect(mapped.connectionType).not.toBe('Not Connected');
    });
  });

  describe('K — readiness / coverage must ignore non-applicable signals', () => {
    it('ICE vehicle: missing evSoc should not reduce capability-aware coverage', () => {
      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicleInput,
          fuelType: 'GASOLINE',
          hardwareType: 'LTE_R1',
          dimoVehicle: {
            tokenId: 1,
            lastSignal: minutesAgo(3),
            syncedAt: minutesAgo(3),
            createdAt: new Date('2026-01-01'),
            rawJson: { aftermarketDevice: { serial: 'SN-1' } },
          },
          latestState: {
            lastSeenAt: minutesAgo(3),
            sourceTimestamp: minutesAgo(3),
            providerFetchedAt: minutesAgo(3),
            latitude: 52.5,
            longitude: 13.4,
            odometerKm: 12000,
            speedKmh: 40,
            fuelLevelRelative: 0.6,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: [],
            lastDtcPollAt: new Date('2026-07-18T11:00:00.000Z'),
            rawPayloadJson: {
              currentLocationCoordinates: { value: [52.5, 13.4] },
              powertrainTransmissionTravelledDistance: { value: 12000 },
              speed: { value: 40 },
              powertrainFuelSystemRelativeLevel: { value: 0.6 },
              obdIsPluggedIn: { value: true },
            },
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      expect(mapped.signals.evSoc).toBe('missing');
      expect(mapped.signals.fuel).toBe('available');
      expect(mapped.coverageState).toBe('GOOD');
      expect(mapped.coveragePercent).toBe(100);
      expect(mapped.readinessLevel).toBe('good');
    });

    it('EV without fuel: fuel missing should not imply DTC missing', () => {
      const signals = deriveFleetSignals({
        hasTelemetry: true,
        latitude: 52.5,
        longitude: 13.4,
        odometerKm: 5000,
        speedKmh: 30,
        fuelLevelRelative: null,
        fuelLevelAbsolute: null,
        evSoc: 0.72,
        obdDtcList: null,
        lastDtcPollAt: new Date('2026-07-18T11:00:00.000Z'),
        obdIsPluggedIn: null,
        jammingDetectedCount: 0,
        rawSignals: {
          powertrainTractionBatteryStateOfChargeCurrent: { value: 0.72 },
        },
      });

      expect(signals.fuel).toBe('missing');
      expect(signals.dtc).toBe('available');
      expect(signals.obdPlug).toBe('missing');
    });

    it('OEM without OBD plug capability leaves obdPlug unknown/missing, not plugged', () => {
      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicleInput,
          dimoVehicle: {
            tokenId: 99,
            lastSignal: minutesAgo(2),
            syncedAt: minutesAgo(2),
            createdAt: new Date('2026-01-01'),
            rawJson: { syntheticDevice: { tokenId: 555 } },
          },
          latestState: {
            lastSeenAt: minutesAgo(2),
            latitude: 48.1,
            longitude: 11.5,
            speedKmh: 50,
            odometerKm: 8000,
            fuelLevelRelative: null,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: { speed: { value: 50 } },
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      expect(mapped.connectionType).toBe('Synthetic Device');
      expect(mapped.obdIsPluggedIn).toBeNull();
      expect(mapped.signals.obdPlug).not.toBe('available');
    });

    it('open unplug episode does not reduce readiness score today (FC-P2-02)', () => {
      const deviceSummary = buildDeviceConnectionSummary({
        vehicleId: baseVehicleInput.id,
        hardwareType: 'LTE_R1',
        dimoLinked: true,
        nowMs: NOW,
        events: [
          {
            id: 'u1',
            vehicleId: baseVehicleInput.id,
            eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
            observedAt: hoursAgo(48),
          },
        ],
        bookings: [],
        trips: [],
        connectivityAnchor: {
          dimoConnectionStatus: DimoConnectionStatus.CONNECTED,
          obdIsPluggedIn: true,
        },
      });

      const deviceConnection = buildFleetDeviceConnectionFields(deviceSummary);
      expect(deviceConnection.openUnpluggedEpisode).toBe(true);

      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicleInput,
          fuelType: 'GASOLINE',
          hardwareType: 'LTE_R1',
          dimoVehicle: {
            tokenId: 1,
            lastSignal: minutesAgo(3),
            syncedAt: minutesAgo(3),
            createdAt: new Date('2026-01-01'),
            rawJson: { aftermarketDevice: { serial: 'SN-1' } },
          },
          latestState: {
            lastSeenAt: minutesAgo(3),
            latitude: 52.5,
            longitude: 13.4,
            speedKmh: 0,
            odometerKm: 1000,
            fuelLevelRelative: 0.5,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: { obdIsPluggedIn: { value: true } },
            providerSource: 'DIMO',
          },
        },
        NOW,
        deviceConnection,
      );

      // Capability-aware coverage: missing DTC lowers score; unplug episode is separate
      expect(mapped.coverageState).toBe('GOOD');
      expect(mapped.coveragePercent).toBe(83);
      expect(mapped.readinessLevel).toBe('good');
      expect(mapped.deviceConnection?.openUnpluggedEpisode).toBe(true);
    });
  });

  describe('API contract — fleet connectivity attaches deviceConnection projection', () => {
    it('getFleetConnectivity maps device summaries into response DTO', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: baseVehicleInput.id,
          vin: baseVehicleInput.vin,
          licensePlate: baseVehicleInput.licensePlate,
          make: baseVehicleInput.make,
          model: baseVehicleInput.model,
          year: baseVehicleInput.year,
          organizationId: 'org-1',
          hardwareType: 'LTE_R1',
          dimoVehicleId: 'dimo-1',
          dimoVehicle: {
            tokenId: 1,
            lastSignal: minutesAgo(3),
            syncedAt: minutesAgo(3),
            createdAt: new Date('2026-01-01'),
            rawJson: {},
          },
          latestState: {
            lastSeenAt: minutesAgo(3),
            latitude: 52.5,
            longitude: 13.4,
            speedKmh: 0,
            odometerKm: 1000,
            fuelLevelRelative: 0.5,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: {},
            providerSource: 'DIMO',
          },
          homeStation: { name: 'Berlin' },
        },
      ]);

      const openSummary = buildDeviceConnectionSummary({
        vehicleId: baseVehicleInput.id,
        hardwareType: 'LTE_R1',
        dimoLinked: true,
        nowMs: NOW,
        events: [
          {
            id: 'u1',
            vehicleId: baseVehicleInput.id,
            eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
            observedAt: hoursAgo(2),
          },
        ],
        bookings: [],
        trips: [],
      });

      const deviceConnectionQuery = {
        getFleetSummariesForVehicles: jest
          .fn()
          .mockResolvedValue(new Map([[baseVehicleInput.id, openSummary]])),
      };

      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findMany } },
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        deviceConnectionQuery,
        stub(),
      );

      const res = await service.getFleetConnectivity('org-1', {});
      expect(res.vehicles[0].deviceConnection?.openUnpluggedEpisode).toBe(true);
      expect(res.vehicles[0].connectionStatus).toBe('online');
    });
  });
});

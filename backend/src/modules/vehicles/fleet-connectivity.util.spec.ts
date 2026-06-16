import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  ONLINE_MAX_MS,
  STANDBY_MAX_MS,
  buildFleetConnectivitySummary,
  deriveConnectionStatus,
  deriveFleetSignals,
  deriveReadinessLevel,
  mapFleetConnectivityVehicle,
  maskSensitiveId,
  computeSignalCoveragePercent,
  paginateFleetConnectivityVehicles,
} from './fleet-connectivity.util';

const NOW = new Date('2026-06-17T12:00:00.000Z').getTime();

function minutesAgo(minutes: number): Date {
  return new Date(NOW - minutes * 60_000);
}

function hoursAgo(hours: number): Date {
  return new Date(NOW - hours * 3_600_000);
}

describe('fleet-connectivity.util', () => {
  describe('deriveConnectionStatus', () => {
    it('returns not_connected without provider link', () => {
      const result = deriveConnectionStatus(false, null, NOW);
      expect(result.connectionStatus).toBe('not_connected');
    });

    it('returns online when last signal is under 15 minutes', () => {
      const lastSeenMs = minutesAgo(5).getTime();
      const result = deriveConnectionStatus(true, lastSeenMs, NOW);
      expect(result.connectionStatus).toBe('online');
      expect(NOW - lastSeenMs).toBeLessThan(ONLINE_MAX_MS);
    });

    it('returns standby between 15 minutes and 24 hours', () => {
      const lastSeenMs = hoursAgo(2).getTime();
      const result = deriveConnectionStatus(true, lastSeenMs, NOW);
      expect(result.connectionStatus).toBe('standby');
      const diff = NOW - lastSeenMs;
      expect(diff).toBeGreaterThanOrEqual(ONLINE_MAX_MS);
      expect(diff).toBeLessThan(STANDBY_MAX_MS);
    });

    it('returns offline when last signal is older than 24 hours', () => {
      const lastSeenMs = hoursAgo(30).getTime();
      const result = deriveConnectionStatus(true, lastSeenMs, NOW);
      expect(result.connectionStatus).toBe('offline');
      expect(NOW - lastSeenMs).toBeGreaterThanOrEqual(STANDBY_MAX_MS);
    });

    it('returns offline when linked but no usable signal timestamp', () => {
      const result = deriveConnectionStatus(true, null, NOW);
      expect(result.connectionStatus).toBe('offline');
    });

    it('handles invalid future timestamps safely', () => {
      const future = NOW + 60_000;
      const result = deriveConnectionStatus(true, future, NOW);
      expect(result.connectionStatus).toBe('offline');
      expect(result.statusNote).toContain('Zukunft');
    });
  });

  describe('maskSensitiveId', () => {
    it('masks long token ids', () => {
      expect(maskSensitiveId('1234567890123')).toBe('123…123');
    });

    it('masks short values without exposing full secret', () => {
      expect(maskSensitiveId('AB')).toBe('**');
      expect(maskSensitiveId('1234')).toBe('1…4');
    });

    it('returns null for empty values', () => {
      expect(maskSensitiveId(null)).toBeNull();
      expect(maskSensitiveId('')).toBeNull();
    });
  });

  describe('mapFleetConnectivityVehicle', () => {
    const baseVehicle = {
      id: 'v-1',
      vin: 'WVWZZZ1JZXW000001',
      licensePlate: 'B-XY 123',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      homeStation: { name: 'Berlin' },
      dimoVehicle: null,
      latestState: null,
    };

    it('maps not_connected without dimoVehicle', () => {
      const mapped = mapFleetConnectivityVehicle(baseVehicle, NOW);
      expect(mapped.connectionStatus).toBe('not_connected');
      expect(mapped.dimoTokenId).toBeNull();
      expect(mapped.maskedDimoTokenId).toBeNull();
      expect(mapped.deviceSerial).toBeNull();
    });

    it('maps online with fresh telemetry', () => {
      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicle,
          dimoVehicle: {
            tokenId: 12345678,
            lastSignal: minutesAgo(3),
            syncedAt: minutesAgo(3),
            createdAt: new Date('2026-01-01'),
            rawJson: { aftermarketDevice: { serial: 'SN-SECRET-999' } },
          },
          latestState: {
            lastSeenAt: minutesAgo(3),
            latitude: 52.5,
            longitude: 13.4,
            speedKmh: 40,
            odometerKm: 12000,
            fuelLevelRelative: 0.5,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: {
              obdIsPluggedIn: { value: true },
              connectivityCellularIsJammingDetected: { value: 0 },
            },
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      expect(mapped.connectionStatus).toBe('online');
      expect(mapped.obdIsPluggedIn).toBe(true);
      expect(mapped.maskedDeviceSerial).not.toBe('SN-SECRET-999');
      expect(mapped.maskedDimoTokenId).toBe('123…678');
      expect(mapped.dimoTokenId).toBeNull();
      expect(mapped.signals.gps).toBe('available');
      expect(mapped.signals.odometer).toBe('available');
      expect(mapped.readinessScore).toBeGreaterThan(0);
    });

    it('labels jamming as snapshot indication only', () => {
      const mapped = mapFleetConnectivityVehicle(
        {
          ...baseVehicle,
          dimoVehicle: {
            tokenId: 99,
            lastSignal: minutesAgo(2),
            syncedAt: minutesAgo(2),
            createdAt: new Date('2026-01-01'),
            rawJson: {},
          },
          latestState: {
            lastSeenAt: minutesAgo(2),
            latitude: null,
            longitude: null,
            speedKmh: null,
            odometerKm: null,
            fuelLevelRelative: null,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: {
              connectivityCellularIsJammingDetected: { value: 3 },
            },
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      expect(mapped.jammingDetectedCount).toBe(3);
      expect(mapped.jammingIncidents).toHaveLength(1);
      expect(mapped.jammingIncidents[0].isSnapshotIndication).toBe(true);
      expect(mapped.jammingSnapshotNote).toContain('Momentaufnahme');
    });
  });

  describe('OBD mapping', () => {
    it('counts plugged, unplugged and no-data in summary', () => {
      const summary = buildFleetConnectivitySummary([
        {
          connectionStatus: 'online',
          obdIsPluggedIn: true,
          jammingDetectedCount: 0,
          hasTelemetry: true,
          signalCoveragePercent: 50,
          readinessScore: 50,
        } as any,
        {
          connectionStatus: 'offline',
          obdIsPluggedIn: false,
          jammingDetectedCount: 0,
          hasTelemetry: true,
          signalCoveragePercent: 25,
          readinessScore: 25,
        } as any,
        {
          connectionStatus: 'not_connected',
          obdIsPluggedIn: null,
          jammingDetectedCount: 0,
          hasTelemetry: false,
          signalCoveragePercent: 0,
          readinessScore: 0,
        } as any,
      ]);

      expect(summary.obdPluggedIn).toBe(1);
      expect(summary.obdUnplugged).toBe(1);
      expect(summary.obdNoData).toBe(1);
    });
  });

  describe('readinessScore / signalCoverage', () => {
    it('does not fabricate scores without known signals', () => {
      const signals = deriveFleetSignals({
        hasTelemetry: false,
        latitude: null,
        longitude: null,
        odometerKm: null,
        speedKmh: null,
        fuelLevelRelative: null,
        fuelLevelAbsolute: null,
        evSoc: null,
        obdDtcList: null,
        lastDtcPollAt: null,
        obdIsPluggedIn: null,
        jammingDetectedCount: 0,
        rawSignals: null,
      });
      expect(computeSignalCoveragePercent(signals)).toBe(0);
      expect(
        deriveReadinessLevel(0, false, false, signals),
      ).toBe('no_data');
    });
  });

  describe('extractConnectivitySnapshot jamming', () => {
    it('returns at most one snapshot incident row', () => {
      const result = extractConnectivitySnapshot({
        connectivityCellularIsJammingDetected: { value: 5 },
      });
      expect(result.jammingDetectedCount).toBe(5);
      expect(result.jammingIncidents).toHaveLength(1);
      expect(result.jammingIncidents[0].isSnapshotIndication).toBe(true);
    });
  });

  describe('pagination', () => {
    it('paginates filtered results', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const page1 = paginateFleetConnectivityVehicles(items, 1, 10);
      expect(page1.pageItems).toHaveLength(10);
      expect(page1.total).toBe(25);
      const page3 = paginateFleetConnectivityVehicles(items, 3, 10);
      expect(page3.pageItems).toHaveLength(5);
    });
  });
});

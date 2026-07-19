/**
 * Cross-surface telemetry consistency regressions (I + H).
 *
 * Same vehicle input must resolve to the same canonical freshness across
 * Fleet Connectivity, Fleet Main List, Vehicle Detail, Dashboard, and
 * booking/offline gates.
 */
import { describe, expect, it } from 'vitest';
import type { FleetConnectivityStatus, FleetTelemetryFreshness, OverallConnectivityState, VehicleConnectivityRuntimeState } from '../../../lib/api';
import { isVehicleOffline } from '../data/vehicles';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  classifyTelemetryFreshness,
  resolveCanonicalTelemetryObservedAtMs,
  resolveTelemetryFreshness,
  TELEMETRY_DELAYED_MAX_MS,
  TELEMETRY_LIVE_MAX_MS,
  TELEMETRY_STANDBY_MAX_MS,
  type TelemetryFreshness,
} from './telemetryFreshness';
import type { VehicleData } from '../data/vehicles';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

function minutesAgo(m: number): string {
  return new Date(NOW - m * 60_000).toISOString();
}

function baseVehicle(lastSignal: string): VehicleData {
  return {
    id: 'v-cross-1',
    license: 'B-CS 1',
    model: 'Golf',
    year: 2022,
    station: 'Berlin',
    fuelType: 'Petrol',
    status: 'available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal,
    badge: 0,
    odometer: 1000,
    fuel: 50,
    battery: 0,
    speed: 0,
    coolant: 0,
    lat: 52.5,
    lng: 13.4,
    signalAgeMs: NOW - Date.parse(lastSignal),
  };
}

function runtimeFixture(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'v-cross-1',
    organizationId: 'org-1',
    overallState: 'TELEMETRY_ACTIVE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'NOT_APPLICABLE',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    reasonCodes: ['TELEMETRY_FRESH'],
    recommendedAction: 'NONE',
    requiresAction: false,
    lastTelemetryAt: minutesAgo(5),
    lastProviderObservedAt: minutesAgo(5),
    lastReceivedAt: minutesAgo(5),
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: new Date(NOW).toISOString(),
    stateVersion: 1,
    ...overrides,
  };
}

function mapOverallToConnectionStatus(overall: OverallConnectivityState): FleetConnectivityStatus {
  switch (overall) {
    case 'TELEMETRY_ACTIVE':
      return 'online';
    case 'STANDBY':
      return 'standby';
    case 'SOFT_OFFLINE':
      return 'signal_delayed';
    case 'DEVICE_UNPLUGGED':
      return 'signal_delayed';
    case 'OFFLINE':
    case 'UNKNOWN':
    case 'INTEGRATION_ERROR':
      return 'offline';
    case 'AUTHORIZATION_REQUIRED':
    case 'NO_ACTIVE_DATA_SOURCE':
      return 'not_connected';
    default:
      return 'offline';
  }
}

function fleetConnectivityFromRuntime(
  runtime: VehicleConnectivityRuntimeState,
): {
  connectionStatus: FleetConnectivityStatus;
  telemetryFreshness: FleetTelemetryFreshness;
} {
  return {
    telemetryFreshness: runtime.telemetryState,
    connectionStatus: mapOverallToConnectionStatus(runtime.overallState),
  };
}

function mapFreshnessToFleetConnectionStatus(
  freshness: FleetTelemetryFreshness,
): FleetConnectivityStatus {
  switch (freshness) {
    case 'live':
      return 'online';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'signal_delayed';
    case 'offline':
    case 'no_signal':
    default:
      return 'offline';
  }
}

function fleetConnectivityFromCanonical(lastSignal: string | null): {
  connectionStatus: FleetConnectivityStatus;
  telemetryFreshness: FleetTelemetryFreshness;
} {
  const freshness = resolveTelemetryFreshness(
    lastSignal ? { providerObservedAt: lastSignal, lastSignal } : {},
    { now: NOW },
  ).freshness;
  return {
    telemetryFreshness: freshness,
    connectionStatus: mapFreshnessToFleetConnectionStatus(freshness),
  };
}

type SurfaceTelemetry = {
  surface: string;
  freshness: TelemetryFreshness | FleetConnectivityStatus;
};

function resolveAcrossSurfaces(lastSignal: string): SurfaceTelemetry[] {
  const vehicle = baseVehicle(lastSignal);
  const canonical = resolveTelemetryFreshness(vehicle, { now: NOW }).freshness;
  const fleetMain = resolveFleetVehicleDisplayState(vehicle, { now: NOW }).telemetryStatus;
  const fleetApi = fleetConnectivityFromCanonical(lastSignal);

  return [
    { surface: 'canonical', freshness: canonical },
    { surface: 'fleet_main_list', freshness: fleetMain },
    { surface: 'vehicle_detail', freshness: resolveTelemetryFreshness(vehicle, { now: NOW }).freshness },
    { surface: 'dashboard', freshness: resolveTelemetryFreshness(vehicle, { now: NOW }).freshness },
    { surface: 'fleet_connectivity_api', freshness: fleetApi.telemetryFreshness },
    {
      surface: 'notifications_offline_gate',
      freshness: isVehicleOffline(vehicle) ? 'offline' : canonical,
    },
  ];
}

describe('connectivity cross-surface regressions', () => {
  describe('H — canonical freshness thresholds', () => {
    it('documents 15m / 24h / 48h boundaries', () => {
      expect(TELEMETRY_LIVE_MAX_MS).toBe(15 * 60 * 1000);
      expect(TELEMETRY_STANDBY_MAX_MS).toBe(24 * 60 * 60 * 1000);
      expect(TELEMETRY_DELAYED_MAX_MS).toBe(48 * 60 * 60 * 1000);
    });

    it.each([
      { age: 0, expected: 'live' as const },
      { age: TELEMETRY_LIVE_MAX_MS - 1, expected: 'live' as const },
      { age: TELEMETRY_STANDBY_MAX_MS - 60_000, expected: 'standby' as const },
      { age: TELEMETRY_STANDBY_MAX_MS, expected: 'signal_delayed' as const },
      { age: TELEMETRY_DELAYED_MAX_MS - 60_000, expected: 'signal_delayed' as const },
      { age: TELEMETRY_DELAYED_MAX_MS, expected: 'offline' as const },
      { age: null, expected: 'no_signal' as const },
    ])('classifyTelemetryFreshness age=$age → $expected', ({ age, expected }) => {
      expect(classifyTelemetryFreshness(age)).toBe(expected);
    });

    it('backfill received now does not rejuvenate stale observed signal', () => {
      const observed = hoursAgo(30);
      const age = resolveTelemetryFreshness(
        {
          providerObservedAt: observed,
          receivedAt: new Date(NOW).toISOString(),
        },
        { now: NOW },
      );
      expect(age.freshness).toBe('signal_delayed');
      expect(resolveCanonicalTelemetryObservedAtMs({
        providerObservedAt: observed,
        receivedAt: new Date(NOW).toISOString(),
      })).toBe(Date.parse(observed));
    });
  });

  describe('I — cross-surface telemetry consistency', () => {
    it('live vehicle: fleet main, detail, dashboard share canonical live', () => {
      const surfaces = resolveAcrossSurfaces(minutesAgo(5));
      const canonical = surfaces.find((s) => s.surface === 'canonical')!.freshness;
      expect(canonical).toBe('live');

      for (const name of ['fleet_main_list', 'vehicle_detail', 'dashboard']) {
        expect(surfaces.find((s) => s.surface === name)?.freshness).toBe('live');
      }
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe('live');
    });

    it('standby vehicle: rental surfaces agree on standby', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(3));
      expect(surfaces.find((s) => s.surface === 'canonical')?.freshness).toBe('standby');
      expect(surfaces.find((s) => s.surface === 'fleet_main_list')?.freshness).toBe('standby');
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe('standby');
      expect(deriveFleetVisualState(baseVehicle(hoursAgo(3))).isStale).toBe(false);
    });

    it('30h signal_delayed is consistent across rental and fleet API surfaces', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(30));
      const rentalSurfaces = ['canonical', 'fleet_main_list', 'vehicle_detail', 'dashboard', 'fleet_connectivity_api'];

      for (const name of rentalSurfaces) {
        expect(surfaces.find((s) => s.surface === name)?.freshness).toBe('signal_delayed');
      }
    });

    it('offline ≥48h: all surfaces report offline', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(50));
      expect(surfaces.find((s) => s.surface === 'canonical')?.freshness).toBe('offline');
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe('offline');
      expect(isVehicleOffline(baseVehicle(hoursAgo(50)))).toBe(true);
    });

    it('no signal: canonical no_signal; fleet API offline; offline gate warns', () => {
      const vehicle = { ...baseVehicle(''), lastSignal: '', signalAgeMs: Number.MAX_SAFE_INTEGER };
      const fresh = resolveTelemetryFreshness(vehicle, { now: NOW });
      expect(fresh.freshness).toBe('no_signal');
      expect(fleetConnectivityFromCanonical(null).telemetryFreshness).toBe('no_signal');
      expect(isVehicleOffline(vehicle)).toBe(true);
    });
  });

  describe('canonical runtime state — no parallel live + unplugged', () => {
    it('DEVICE_UNPLUGGED incident never presents legacy online', () => {
      const runtime = runtimeFixture({
        overallState: 'DEVICE_UNPLUGGED',
        telemetryState: 'live',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
        attentionState: 'ACTION_REQUIRED',
        activeEpisodeId: 'ep-1',
        evidence: { openUnpluggedEpisode: true },
      });
      const legacy = fleetConnectivityFromRuntime(runtime);
      expect(legacy.connectionStatus).not.toBe('online');
      expect(runtime.overallState).toBe('DEVICE_UNPLUGGED');
    });

    it('standby runtime does not block (attention NONE)', () => {
      const runtime = runtimeFixture({
        overallState: 'STANDBY',
        telemetryState: 'standby',
      });
      expect(runtime.attentionState).toBe('NONE');
      expect(runtime.overallState).toBe('STANDBY');
    });

    it('soft-offline is WATCH not hard offline overall', () => {
      const runtime = runtimeFixture({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
        attentionState: 'WATCH',
      });
      expect(runtime.overallState).toBe('SOFT_OFFLINE');
      expect(runtime.overallState).not.toBe('OFFLINE');
    });

    it('partial coverage does not force OFFLINE overall', () => {
      const runtime = runtimeFixture({
        dataCoverageState: 'PARTIAL',
        attentionState: 'WATCH',
      });
      expect(runtime.dataCoverageState).toBe('PARTIAL');
      expect(runtime.overallState).not.toBe('OFFLINE');
    });

    it('unknown telemetry is not TELEMETRY_ACTIVE', () => {
      const runtime = runtimeFixture({
        overallState: 'UNKNOWN',
        telemetryState: 'no_signal',
        dataCoverageState: 'UNKNOWN',
      });
      expect(runtime.overallState).not.toBe('TELEMETRY_ACTIVE');
    });
  });
});

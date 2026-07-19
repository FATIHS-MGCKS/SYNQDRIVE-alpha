/**
 * Cross-surface telemetry consistency regressions (I + H).
 *
 * Same vehicle input must resolve to the same canonical freshness across
 * Fleet Connectivity, Fleet Main List, Vehicle Detail, Dashboard, and
 * booking/offline gates — while documenting known Fleet API divergence.
 */
import { describe, expect, it } from 'vitest';
import type { FleetConnectivityStatus } from '../../../lib/api';
import { isVehicleOffline } from '../data/vehicles';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  classifyTelemetryFreshness,
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

/** Fleet Connectivity tab uses backend 3-state mapping via API DTO — simulate here. */
function fleetConnectivityStatusFromLastSeen(
  lastSeenIso: string | null,
): FleetConnectivityStatus {
  const lastMs = lastSeenIso ? Date.parse(lastSeenIso) : null;
  return deriveConnectionStatus(
    true,
    lastMs != null && Number.isFinite(lastMs) ? lastMs : null,
    NOW,
  ).connectionStatus;
}

function deriveConnectionStatus(
  hasProviderLink: boolean,
  lastSeenMs: number | null,
  nowMs: number,
): { connectionStatus: FleetConnectivityStatus } {
  const ONLINE_MAX_MS = 15 * 60 * 1000;
  const STANDBY_MAX_MS = 24 * 60 * 60 * 1000;

  if (!hasProviderLink) return { connectionStatus: 'not_connected' };
  if (lastSeenMs == null) return { connectionStatus: 'offline' };
  const diff = nowMs - lastSeenMs;
  if (diff < ONLINE_MAX_MS) return { connectionStatus: 'online' };
  if (diff < STANDBY_MAX_MS) return { connectionStatus: 'standby' };
  return { connectionStatus: 'offline' };
}

type SurfaceTelemetry = {
  surface: string;
  freshness: TelemetryFreshness | 'fleet_api_offline' | 'fleet_api_standby' | 'fleet_api_online';
};

function resolveAcrossSurfaces(lastSignal: string): SurfaceTelemetry[] {
  const vehicle = baseVehicle(lastSignal);
  const canonical = resolveTelemetryFreshness(vehicle, { now: NOW }).freshness;
  const fleetMain = resolveFleetVehicleDisplayState(vehicle, { now: NOW }).telemetryStatus;
  const dashboardFresh = resolveTelemetryFreshness(vehicle, { now: NOW }).freshness;
  const fleetTab = fleetConnectivityStatusFromLastSeen(lastSignal);

  return [
    { surface: 'canonical', freshness: canonical },
    { surface: 'fleet_main_list', freshness: fleetMain },
    { surface: 'vehicle_detail', freshness: resolveTelemetryFreshness(vehicle, { now: NOW }).freshness },
    { surface: 'dashboard', freshness: dashboardFresh },
    {
      surface: 'fleet_connectivity_api',
      freshness:
        fleetTab === 'online'
          ? 'fleet_api_online'
          : fleetTab === 'standby'
            ? 'fleet_api_standby'
            : 'fleet_api_offline',
    },
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
      { age: 5 * 60_000, expected: 'live' as const },
      { age: 3 * 3_600_000, expected: 'standby' as const },
      { age: 30 * 3_600_000, expected: 'signal_delayed' as const },
      { age: 50 * 3_600_000, expected: 'offline' as const },
      { age: null, expected: 'no_signal' as const },
    ])('classifyTelemetryFreshness age=$age → $expected', ({ age, expected }) => {
      expect(classifyTelemetryFreshness(age)).toBe(expected);
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
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe(
        'fleet_api_online',
      );
    });

    it('standby vehicle: rental surfaces agree on standby', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(3));
      expect(surfaces.find((s) => s.surface === 'canonical')?.freshness).toBe('standby');
      expect(surfaces.find((s) => s.surface === 'fleet_main_list')?.freshness).toBe('standby');
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe(
        'fleet_api_standby',
      );
      expect(deriveFleetVisualState(baseVehicle(hoursAgo(3))).isStale).toBe(false);
    });

    it('FC-P1-02: 30h signal_delayed in rental surfaces vs fleet API offline', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(30));
      const rentalSurfaces = ['canonical', 'fleet_main_list', 'vehicle_detail', 'dashboard'];

      for (const name of rentalSurfaces) {
        expect(surfaces.find((s) => s.surface === name)?.freshness).toBe('signal_delayed');
      }
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe(
        'fleet_api_offline',
      );
    });

    it('offline ≥48h: all surfaces report offline or fleet_api_offline', () => {
      const surfaces = resolveAcrossSurfaces(hoursAgo(50));
      expect(surfaces.find((s) => s.surface === 'canonical')?.freshness).toBe('offline');
      expect(surfaces.find((s) => s.surface === 'fleet_connectivity_api')?.freshness).toBe(
        'fleet_api_offline',
      );
      expect(isVehicleOffline(baseVehicle(hoursAgo(50)))).toBe(true);
    });

    it('no signal: canonical no_signal; fleet API offline; offline gate warns', () => {
      const vehicle = { ...baseVehicle(''), lastSignal: '', signalAgeMs: Number.MAX_SAFE_INTEGER };
      const fresh = resolveTelemetryFreshness(vehicle, { now: NOW });
      expect(fresh.freshness).toBe('no_signal');
      expect(fleetConnectivityStatusFromLastSeen(null)).toBe('offline');
      expect(isVehicleOffline(vehicle)).toBe(true);
    });
  });
});

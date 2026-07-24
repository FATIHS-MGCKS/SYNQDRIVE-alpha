/**
 * Vehicle Detail Page — remediation unit test suite (Prompt 29/36).
 *
 * Maps directly to the P0/P1 regression areas for status, telemetry, position,
 * store binding, and readiness. Uses deterministic `now` — no provider calls.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyTelemetryFreshness,
  parseTelemetryTimestampMs,
  resolveCanonicalTelemetryObservedAtMs,
  resolveTelemetryFreshness,
  TELEMETRY_DELAYED_MAX_MS,
  TELEMETRY_STANDBY_MAX_MS,
} from './telemetryFreshness';
import { deriveOverviewMapPosition } from './overview-map-position';
import {
  normalizeVehicleOperationalStatus,
  normalizeVehicleOperationalStatusKey,
  selectCanBeConsideredForRentalReadiness,
  selectIsCurrentlyAvailable,
  selectOperationalStatus,
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';
import { deriveVehicleOverviewReadiness } from './vehicle-overview-readiness.utils';
import type { VehicleOverviewCards, VehicleOverviewHealthSnapshot } from './vehicle-overview.types';

const NOW = Date.parse('2026-07-24T12:00:00.000Z');
const isoHoursAgo = (hours: number) =>
  new Date(NOW - hours * 60 * 60 * 1000).toISOString();

function emptyCards(): VehicleOverviewCards {
  return {
    trips: { loadState: 'ready', status: 'neutral', targetTab: 'trips', headline: '', title: 'Trips' },
    bookings: { loadState: 'ready', status: 'neutral', targetTab: 'vehicle-bookings', headline: '', title: 'Bookings' },
    tasks: { loadState: 'ready', status: 'neutral', targetTab: 'vehicle-tasks', headline: '', title: 'Tasks' },
    damages: { loadState: 'ready', status: 'neutral', targetTab: 'damages', headline: '', title: 'Damages' },
    documents: { loadState: 'ready', status: 'neutral', targetTab: 'documents', headline: '', title: 'Documents' },
  };
}

function healthSnapshot(
  overrides: Partial<VehicleOverviewHealthSnapshot> = {},
): VehicleOverviewHealthSnapshot {
  return {
    loadState: 'ready',
    effectiveStatus: 'Good Health',
    rentalBlocked: false,
    blockingReasons: [],
    ...overrides,
  };
}

describe('Vehicle Detail remediation suite', () => {
  describe('1. status normalization', () => {
    it('maps legacy and prisma tokens to canonical enums', () => {
      expect(normalizeVehicleOperationalStatusKey('Available')).toBe(
        VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      );
      expect(normalizeVehicleOperationalStatusKey('RENTED')).toBe(
        VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      );
      expect(normalizeVehicleOperationalStatusKey('IN_SERVICE')).toBe(
        VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      );
    });
  });

  describe('2. unknown status', () => {
    it('never maps garbage or empty values to AVAILABLE', () => {
      expect(normalizeVehicleOperationalStatusKey('')).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
      expect(normalizeVehicleOperationalStatusKey('???')).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
      expect(
        normalizeVehicleOperationalStatus({
          status: 'Available',
          dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
        }).status,
      ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    });
  });

  describe('3. rental readiness', () => {
    it('overview readiness is blocked only from canonical rentalBlocked signal', () => {
      const blocked = deriveVehicleOverviewReadiness({
        cards: emptyCards(),
        health: healthSnapshot({
          rentalBlocked: true,
          blockingReasons: ['Missing TÜV'],
        }),
      });
      expect(blocked.readinessStatus).toBe('blocked');
      expect(blocked.blockers).toContain('Missing TÜV');

      const attentionOnly = deriveVehicleOverviewReadiness({
        cards: emptyCards(),
        health: healthSnapshot({ effectiveStatus: 'Critical' }),
      });
      expect(attentionOnly.readinessStatus).not.toBe('blocked');
    });

    it('operational selector treats reliable AVAILABLE as rental-ready', () => {
      const vehicle = {
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        isReliable: true,
      };
      expect(selectCanBeConsideredForRentalReadiness(vehicle)).toBe(true);
    });
  });

  describe('4. blocked/maintenance separation', () => {
    it('keeps BLOCKED and MAINTENANCE as distinct canonical statuses', () => {
      expect(normalizeVehicleOperationalStatusKey('Blocked')).toBe(
        VEHICLE_OPERATIONAL_STATUS.BLOCKED,
      );
      expect(normalizeVehicleOperationalStatusKey('Maintenance')).toBe(
        VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      );
      expect(selectOperationalStatus({ status: VEHICLE_OPERATIONAL_STATUS.BLOCKED })).toBe(
        VEHICLE_OPERATIONAL_STATUS.BLOCKED,
      );
      expect(selectOperationalStatus({ status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE })).toBe(
        VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      );
    });

    it('neither BLOCKED nor MAINTENANCE is currently available', () => {
      expect(
        selectIsCurrentlyAvailable({ status: VEHICLE_OPERATIONAL_STATUS.BLOCKED, isReliable: true }),
      ).toBe(false);
      expect(
        selectIsCurrentlyAvailable({
          status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
          isReliable: true,
        }),
      ).toBe(false);
    });
  });

  describe('5. null value semantics', () => {
    it('treats null/undefined telemetry timestamps as unparseable', () => {
      expect(parseTelemetryTimestampMs(null)).toBeNull();
      expect(parseTelemetryTimestampMs(undefined)).toBeNull();
      expect(resolveCanonicalTelemetryObservedAtMs({ lastSignal: null })).toBeNull();
    });
  });

  describe('6. actual null value', () => {
    it('classifies missing age as no_signal, not live', () => {
      const state = resolveTelemetryFreshness({}, { now: NOW });
      expect(state.freshness).toBe('no_signal');
      expect(state.isLive).toBe(false);
    });
  });

  describe('7. provider measurement time', () => {
    it('prefers providerObservedAt over receivedAt and lastSignal', () => {
      const observed = resolveCanonicalTelemetryObservedAtMs({
        providerObservedAt: isoHoursAgo(2),
        receivedAt: isoHoursAgo(0.1),
        lastSignal: isoHoursAgo(30),
      });
      expect(observed).toBe(Date.parse(isoHoursAgo(2)));
    });
  });

  describe('8. received time', () => {
    it('does not backfill stale observed timestamps with fresh receivedAt', () => {
      const freshness = resolveTelemetryFreshness(
        {
          lastSignal: isoHoursAgo(30),
          receivedAt: isoHoursAgo(0.1),
        },
        { now: NOW },
      );
      expect(freshness.freshness).toBe('signal_delayed');
    });
  });

  describe('9. position resolver', () => {
    it('uses static coordinates when store is not yet bound', () => {
      const view = deriveOverviewMapPosition({
        boundVehicleId: null,
        boundOrgId: null,
        vehicleId: 'veh-1',
        orgId: 'org-1',
        targetPosition: [8, 50],
        lastConfirmedPosition: null,
        staticLat: 51.31,
        staticLng: 9.48,
        loading: true,
        error: null,
        isLiveTracking: false,
        isFresh: false,
        gpsSource: null,
      });
      expect(view.mode).toBe('staticPositionOnly');
      expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    });
  });

  describe('10. live position', () => {
    it('selects livePosition when bound, tracking, and dimo GPS is fresh', () => {
      const view = deriveOverviewMapPosition({
        boundVehicleId: 'veh-1',
        boundOrgId: 'org-1',
        vehicleId: 'veh-1',
        orgId: 'org-1',
        targetPosition: [9.48, 51.31],
        lastConfirmedPosition: [9.48, 51.31],
        staticLat: null,
        staticLng: null,
        loading: false,
        error: null,
        isLiveTracking: true,
        isFresh: true,
        gpsSource: 'dimo',
      });
      expect(view.mode).toBe('livePosition');
    });
  });

  describe('11. last known position', () => {
    it('falls back to cached coordinates when not live tracking', () => {
      const view = deriveOverviewMapPosition({
        boundVehicleId: 'veh-1',
        boundOrgId: 'org-1',
        vehicleId: 'veh-1',
        orgId: 'org-1',
        targetPosition: null,
        lastConfirmedPosition: [9.48, 51.31],
        staticLat: null,
        staticLng: null,
        loading: false,
        error: null,
        isLiveTracking: false,
        isFresh: false,
        gpsSource: 'cache',
      });
      expect(view.mode).toBe('lastKnownPosition');
      expect(view.operatorHintSub).toBe('Last known position shown');
    });
  });

  describe('12. no position', () => {
    it('returns trackingUnavailable when bound but no coordinates exist', () => {
      const view = deriveOverviewMapPosition({
        boundVehicleId: 'veh-1',
        boundOrgId: 'org-1',
        vehicleId: 'veh-1',
        orgId: 'org-1',
        targetPosition: null,
        lastConfirmedPosition: null,
        staticLat: null,
        staticLng: null,
        loading: false,
        error: null,
        isLiveTracking: false,
        isFresh: false,
        gpsSource: null,
      });
      expect(view.mode).toBe('trackingUnavailable');
      expect(view.showEmptyState).toBe(true);
    });
  });

  describe('13. telemetry state', () => {
    it('maps age to live/standby/delayed/offline states deterministically', () => {
      expect(classifyTelemetryFreshness(5 * 60_000)).toBe('live');
      expect(classifyTelemetryFreshness(2 * 60 * 60_000)).toBe('standby');
      expect(classifyTelemetryFreshness(30 * 60 * 60_000)).toBe('signal_delayed');
      expect(classifyTelemetryFreshness(50 * 60 * 60_000)).toBe('offline');
    });
  });

  describe('14. 24/48 hour thresholds', () => {
    it('uses exact product thresholds', () => {
      expect(TELEMETRY_STANDBY_MAX_MS).toBe(24 * 60 * 60 * 1000);
      expect(TELEMETRY_DELAYED_MAX_MS).toBe(48 * 60 * 60 * 1000);
      expect(classifyTelemetryFreshness(TELEMETRY_STANDBY_MAX_MS)).toBe('signal_delayed');
      expect(classifyTelemetryFreshness(TELEMETRY_DELAYED_MAX_MS)).toBe('offline');
    });
  });

  describe('15. future and invalid timestamps', () => {
    it('rejects invalid timestamp strings', () => {
      expect(parseTelemetryTimestampMs('not-a-date')).toBeNull();
      expect(parseTelemetryTimestampMs('')).toBeNull();
    });

    it('clamps future provider timestamps to age 0 (live)', () => {
      const future = new Date(NOW + 60 * 60_000).toISOString();
      const state = resolveTelemetryFreshness({ providerObservedAt: future }, { now: NOW });
      expect(state.signalAgeMs).toBe(0);
      expect(state.freshness).toBe('live');
    });
  });
});

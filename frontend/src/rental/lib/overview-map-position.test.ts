import { describe, expect, it } from 'vitest';
import { TELEMETRY_LIVE_MAX_MS } from './telemetryFreshness';
import {
  classifyOverviewPositionClass,
  deriveOverviewMapPosition,
  isLivePositionEligible,
  isNullIslandCoordinate,
  isPlausibleMeasuredAt,
  isValidGpsCoordinate,
  parseLngLat,
  type OverviewMapPositionInput,
} from './overview-map-position';

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();
const RECENT_MEASURED_AT = new Date(NOW - 2 * 60_000).toISOString();
const STALE_MEASURED_AT = new Date(NOW - TELEMETRY_LIVE_MAX_MS - 60_000).toISOString();

function baseInput(
  overrides: Partial<OverviewMapPositionInput> = {},
): OverviewMapPositionInput {
  return {
    boundVehicleId: VEHICLE,
    boundOrgId: ORG,
    vehicleId: VEHICLE,
    orgId: ORG,
    targetPosition: [9.48, 51.31],
    lastConfirmedPosition: [9.48, 51.31],
    staticLat: null,
    staticLng: null,
    loading: false,
    error: null,
    isLiveTracking: true,
    gpsSource: 'dimo',
    measuredAt: RECENT_MEASURED_AT,
    lastSignal: RECENT_MEASURED_AT,
    signalAgeMs: 2 * 60_000,
    now: NOW,
    ...overrides,
  };
}

describe('coordinate validation helpers', () => {
  it('rejects null island (0,0)', () => {
    expect(isNullIslandCoordinate(0, 0)).toBe(true);
    expect(isValidGpsCoordinate(0, 0)).toBe(false);
    expect(parseLngLat([0, 0])).toBeNull();
  });

  it('rejects out-of-bounds latitude and longitude', () => {
    expect(isValidGpsCoordinate(91, 0)).toBe(false);
    expect(isValidGpsCoordinate(0, 181)).toBe(false);
    expect(parseLngLat([181, 0])).toBeNull();
    expect(parseLngLat([0, 91])).toBeNull();
  });

  it('accepts valid coordinates', () => {
    expect(isValidGpsCoordinate(51.31, 9.48)).toBe(true);
    expect(parseLngLat([9.48, 51.31])).toEqual([9.48, 51.31]);
  });
});

describe('isPlausibleMeasuredAt', () => {
  it('rejects missing and far-future timestamps', () => {
    expect(isPlausibleMeasuredAt(null, NOW)).toBe(false);
    expect(isPlausibleMeasuredAt(new Date(NOW + 120_000).toISOString(), NOW)).toBe(false);
  });

  it('accepts recent past timestamps within skew tolerance', () => {
    expect(isPlausibleMeasuredAt(RECENT_MEASURED_AT, NOW)).toBe(true);
    expect(isPlausibleMeasuredAt(new Date(NOW + 30_000).toISOString(), NOW)).toBe(true);
  });
});

describe('isLivePositionEligible', () => {
  const eligibleBase = {
    isBound: true,
    isLiveTracking: true,
    targetPosition: [9.48, 51.31] as [number, number],
    gpsSource: 'dimo' as const,
    measuredAt: RECENT_MEASURED_AT,
    lastSignal: RECENT_MEASURED_AT,
    signalAgeMs: 2 * 60_000,
    now: NOW,
  };

  it('requires all live criteria including canonical freshness', () => {
    expect(isLivePositionEligible(eligibleBase)).toBe(true);
  });

  it('rejects cache source even when telemetry is canonically live', () => {
    expect(isLivePositionEligible({ ...eligibleBase, gpsSource: 'cache' })).toBe(false);
  });

  it('rejects stale measuredAt (standby, not live)', () => {
    expect(
      isLivePositionEligible({
        ...eligibleBase,
        measuredAt: STALE_MEASURED_AT,
        lastSignal: STALE_MEASURED_AT,
        signalAgeMs: TELEMETRY_LIVE_MAX_MS + 60_000,
      }),
    ).toBe(false);
  });

  it('rejects missing measuredAt', () => {
    expect(
      isLivePositionEligible({
        ...eligibleBase,
        measuredAt: null,
        lastSignal: null,
        signalAgeMs: null,
      }),
    ).toBe(false);
  });

  it('rejects invalid coordinates', () => {
    expect(
      isLivePositionEligible({
        ...eligibleBase,
        targetPosition: [0, 0],
      }),
    ).toBe(false);
  });

  it('rejects when not live tracking', () => {
    expect(isLivePositionEligible({ ...eligibleBase, isLiveTracking: false })).toBe(false);
  });
});

describe('classifyOverviewPositionClass', () => {
  it('returns live, lastKnown, or none', () => {
    expect(
      classifyOverviewPositionClass({
        isBound: true,
        isLiveTracking: true,
        targetPosition: [9.48, 51.31],
        gpsSource: 'dimo',
        measuredAt: RECENT_MEASURED_AT,
        lastSignal: RECENT_MEASURED_AT,
        signalAgeMs: 2 * 60_000,
        now: NOW,
        lastKnownPosition: [9.48, 51.31],
        staticPosition: null,
      }),
    ).toBe('live');

    expect(
      classifyOverviewPositionClass({
        isBound: true,
        isLiveTracking: true,
        targetPosition: [9.48, 51.31],
        gpsSource: 'cache',
        measuredAt: RECENT_MEASURED_AT,
        lastSignal: RECENT_MEASURED_AT,
        signalAgeMs: 2 * 60_000,
        now: NOW,
        lastKnownPosition: [9.48, 51.31],
        staticPosition: null,
      }),
    ).toBe('lastKnown');

    expect(
      classifyOverviewPositionClass({
        isBound: true,
        isLiveTracking: false,
        targetPosition: null,
        gpsSource: null,
        lastKnownPosition: null,
        staticPosition: null,
      }),
    ).toBe('none');
  });
});

describe('deriveOverviewMapPosition', () => {
  it('uses static coordinates when not yet bound to vehicle', () => {
    const view = deriveOverviewMapPosition({
      boundVehicleId: null,
      boundOrgId: null,
      vehicleId: VEHICLE,
      orgId: ORG,
      targetPosition: [9.5, 51.3],
      lastConfirmedPosition: null,
      staticLat: 51.31,
      staticLng: 9.48,
      loading: true,
      error: null,
      isLiveTracking: false,
      gpsSource: null,
    });

    expect(view.isBoundToCurrentVehicle).toBe(false);
    expect(view.positionClass).toBe('lastKnown');
    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    expect(view.showEmptyState).toBe(false);
  });

  it('ignores stale store position when bound vehicle differs', () => {
    const view = deriveOverviewMapPosition({
      boundVehicleId: 'other-vehicle',
      boundOrgId: ORG,
      vehicleId: VEHICLE,
      orgId: ORG,
      targetPosition: [8, 50],
      lastConfirmedPosition: [8, 50],
      staticLat: 51.31,
      staticLng: 9.48,
      loading: false,
      error: null,
      isLiveTracking: true,
      gpsSource: 'dimo',
      measuredAt: RECENT_MEASURED_AT,
      lastSignal: RECENT_MEASURED_AT,
      now: NOW,
    });

    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    expect(view.mode).toBe('staticPositionOnly');
    expect(view.positionClass).toBe('lastKnown');
  });

  it('does not label cache-sourced GPS as live even when telemetry is fresh', () => {
    const view = deriveOverviewMapPosition(baseInput({ gpsSource: 'cache' }));

    expect(view.positionClass).not.toBe('live');
    expect(view.mode).not.toBe('livePosition');
    expect(view.mode).toBe('lastKnownPosition');
  });

  it('does not label stale measuredAt as live even with dimo source', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        measuredAt: STALE_MEASURED_AT,
        lastSignal: STALE_MEASURED_AT,
        signalAgeMs: TELEMETRY_LIVE_MAX_MS + 60_000,
      }),
    );

    expect(view.positionClass).toBe('lastKnown');
    expect(view.mode).toBe('lastKnownPosition');
  });

  it('does not label dimo without measuredAt as live', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        measuredAt: null,
        lastSignal: null,
        signalAgeMs: null,
      }),
    );

    expect(view.positionClass).toBe('lastKnown');
    expect(view.mode).toBe('lastKnownPosition');
  });

  it('shows live position when all criteria met', () => {
    const view = deriveOverviewMapPosition(baseInput());

    expect(view.positionClass).toBe('live');
    expect(view.mode).toBe('livePosition');
    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    expect(view.operatorHintKey).toBeNull();
  });

  it('treats null island coordinates as no usable position', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        targetPosition: [0, 0],
        lastConfirmedPosition: [0, 0],
        staticLat: null,
        staticLng: null,
        isLiveTracking: false,
      }),
    );

    expect(view.positionClass).toBe('none');
    expect(view.mode).toBe('trackingUnavailable');
    expect(view.showEmptyState).toBe(true);
  });

  it('falls back to static for null island when static exists', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        targetPosition: [0, 0],
        lastConfirmedPosition: null,
        staticLat: 51.31,
        staticLng: 9.48,
        isLiveTracking: true,
        gpsSource: 'dimo',
      }),
    );

    expect(view.positionClass).toBe('lastKnown');
    expect(view.mode).toBe('staticPositionOnly');
    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
  });

  it('shows telemetry error with last known fallback', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        error: 'Network error',
        measuredAt: STALE_MEASURED_AT,
        lastSignal: STALE_MEASURED_AT,
        gpsSource: 'cache',
      }),
    );

    expect(view.positionClass).toBe('lastKnown');
    expect(view.mode).toBe('telemetryUnavailable');
    expect(view.operatorHintKey).toBe('telemetryUnavailable');
    expect(view.operatorHintSubKey).toBe('lastKnownShown');
    expect(view.showEmptyState).toBe(false);
  });

  it('shows empty state when no coordinates exist', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        targetPosition: null,
        lastConfirmedPosition: null,
        isLiveTracking: false,
        gpsSource: null,
        measuredAt: null,
        lastSignal: null,
      }),
    );

    expect(view.positionClass).toBe('none');
    expect(view.mode).toBe('trackingUnavailable');
    expect(view.showEmptyState).toBe(true);
    expect(view.operatorHintKey).toBe('noLiveTracking');
  });

  it('shows loading state without live badge eligibility', () => {
    const view = deriveOverviewMapPosition(
      baseInput({
        targetPosition: null,
        lastConfirmedPosition: null,
        loading: true,
      }),
    );

    expect(view.positionClass).toBe('none');
    expect(view.mode).toBe('noPosition');
    expect(view.showEmptyState).toBe(false);
  });
});

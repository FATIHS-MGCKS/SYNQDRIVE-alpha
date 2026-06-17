import { describe, expect, it } from 'vitest';
import { deriveOverviewMapPosition } from './overview-map-position';

const ORG = 'org-1';
const VEHICLE = 'veh-1';

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
      isFresh: false,
      gpsSource: null,
    });

    expect(view.isBoundToCurrentVehicle).toBe(false);
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
      isFresh: true,
      gpsSource: 'dimo',
    });

    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    expect(view.mode).toBe('staticPositionOnly');
  });

  it('shows live position when bound and tracking', () => {
    const view = deriveOverviewMapPosition({
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
      isFresh: true,
      gpsSource: 'dimo',
    });

    expect(view.mode).toBe('livePosition');
    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
    expect(view.operatorHint).toBeNull();
  });

  it('shows telemetry error with last known fallback', () => {
    const view = deriveOverviewMapPosition({
      boundVehicleId: VEHICLE,
      boundOrgId: ORG,
      vehicleId: VEHICLE,
      orgId: ORG,
      targetPosition: [9.48, 51.31],
      lastConfirmedPosition: [9.48, 51.31],
      staticLat: null,
      staticLng: null,
      loading: false,
      error: 'Network error',
      isLiveTracking: true,
      isFresh: false,
      gpsSource: 'cache',
    });

    expect(view.mode).toBe('telemetryUnavailable');
    expect(view.operatorHint).toBe('Telemetry temporarily unavailable');
    expect(view.operatorHintSub).toBe('Last known position shown');
    expect(view.showEmptyState).toBe(false);
  });

  it('shows empty state when no coordinates exist', () => {
    const view = deriveOverviewMapPosition({
      boundVehicleId: VEHICLE,
      boundOrgId: ORG,
      vehicleId: VEHICLE,
      orgId: ORG,
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
    expect(view.operatorHint).toBe('No live tracking available');
  });
});

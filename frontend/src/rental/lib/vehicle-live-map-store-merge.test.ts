import { beforeEach, describe, expect, it } from 'vitest';
import type { LiveTelemetrySnapshot } from './telemetry-field-semantics';
import {
  canApplyGpsCoordinates,
  isVehicleLiveMapBindingCurrent,
  mergeGpsFreshnessPatch,
  mergeLiveTelemetrySnapshot,
  mergeVehicleLiveMapState,
} from './vehicle-live-map-store-merge';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';

const BASE_SNAPSHOT: LiveTelemetrySnapshot = {
  speed: 40,
  fuel: 55,
  coolant: 88,
  battery: 90,
  lvBatteryVoltage: 12.4,
  odometer: 12_000,
  engineLoad: 22,
  rangeKm: 320,
  tractionBatteryTemperatureC: null,
  headingDeg: 180,
  accuracyM: 5,
  ignitionOn: true,
};

function baseState() {
  return useVehicleLiveMapStore.getState();
}

describe('vehicle-live-map-store-merge', () => {
  beforeEach(() => {
    useVehicleLiveMapStore.getState().reset();
  });

  describe('mergeLiveTelemetrySnapshot', () => {
    it('preserves existing fields when incoming values are null', () => {
      const merged = mergeLiveTelemetrySnapshot(BASE_SNAPSHOT, {
        ...BASE_SNAPSHOT,
        fuel: null,
        odometer: null,
      });
      expect(merged.fuel).toBe(55);
      expect(merged.odometer).toBe(12_000);
      expect(merged.speed).toBe(40);
    });

    it('does not invent a null-default snapshot', () => {
      const incoming: LiveTelemetrySnapshot = {
        speed: 10,
        fuel: null,
        coolant: null,
        battery: null,
        lvBatteryVoltage: null,
        odometer: null,
        engineLoad: null,
        rangeKm: null,
        tractionBatteryTemperatureC: null,
        headingDeg: null,
        accuracyM: null,
      };
      expect(mergeLiveTelemetrySnapshot(null, incoming)).toEqual(incoming);
    });
  });

  describe('mergeVehicleLiveMapState', () => {
    it('keeps GPS fields when dashboard patch arrives', () => {
      useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
      useVehicleLiveMapStore.getState().patchIfBound(
        { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 },
        {
          targetPosition: [9.5, 51.3],
          lastConfirmedPosition: [9.5, 51.3],
          gpsSource: 'dimo',
        },
      );

      const next = mergeVehicleLiveMapState(useVehicleLiveMapStore.getState(), {
        snapshot: { ...BASE_SNAPSHOT, speed: 12 },
        displayState: 'MOVING',
        loading: false,
      });

      expect(next.targetPosition).toEqual([9.5, 51.3]);
      expect(next.snapshot?.speed).toBe(12);
      expect(next.displayState).toBe('MOVING');
    });

    it('keeps dashboard fields when GPS patch arrives', () => {
      useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
      useVehicleLiveMapStore.getState().patchIfBound(
        { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 },
        {
          snapshot: BASE_SNAPSHOT,
          displayState: 'IDLE',
          measuredAt: '2026-07-24T10:00:00.000Z',
        },
      );

      const next = mergeVehicleLiveMapState(useVehicleLiveMapStore.getState(), {
        targetPosition: [9.6, 51.4],
        lastConfirmedPosition: [9.6, 51.4],
        gpsSource: 'dimo',
      });

      expect(next.snapshot?.fuel).toBe(55);
      expect(next.displayState).toBe('IDLE');
      expect(next.targetPosition).toEqual([9.6, 51.4]);
    });
  });

  describe('timestamp ordering', () => {
    it('rejects older provider measurement for GPS coordinates', () => {
      const current = {
        measuredAt: '2026-07-24T10:05:00.000Z',
        lastSignal: '2026-07-24T10:05:00.000Z',
      };
      expect(canApplyGpsCoordinates(current, '2026-07-24T10:04:00.000Z')).toBe(false);
      expect(canApplyGpsCoordinates(current, '2026-07-24T10:06:00.000Z')).toBe(true);
    });

    it('accepts newer GPS freshness timestamps only', () => {
      useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
      const state = {
        ...useVehicleLiveMapStore.getState(),
        measuredAt: '2026-07-24T10:05:00.000Z',
        lastSignal: '2026-07-24T10:05:00.000Z',
        receivedAt: '2026-07-24T10:05:01.000Z',
      };

      const older = mergeGpsFreshnessPatch(state, {
        measuredAt: '2026-07-24T10:04:00.000Z',
        source: 'dimo',
      });
      expect(older.measuredAt).toBeUndefined();

      const newer = mergeGpsFreshnessPatch(state, {
        measuredAt: '2026-07-24T10:06:00.000Z',
        source: 'dimo',
      });
      expect(newer.measuredAt).toBe('2026-07-24T10:06:00.000Z');
    });
  });

  describe('binding checks', () => {
    it('requires vehicleId, orgId, and generation', () => {
      const state = {
        ...baseState(),
        boundVehicleId: 'veh-1',
        boundOrgId: 'org-1',
        boundGeneration: 2,
      };
      expect(
        isVehicleLiveMapBindingCurrent(state, {
          vehicleId: 'veh-1',
          orgId: 'org-1',
          generation: 2,
        }),
      ).toBe(true);
      expect(
        isVehicleLiveMapBindingCurrent(state, {
          vehicleId: 'veh-2',
          orgId: 'org-1',
          generation: 2,
        }),
      ).toBe(false);
      expect(
        isVehicleLiveMapBindingCurrent(state, {
          vehicleId: 'veh-1',
          orgId: 'org-2',
          generation: 2,
        }),
      ).toBe(false);
      expect(
        isVehicleLiveMapBindingCurrent(state, {
          vehicleId: 'veh-1',
          orgId: 'org-1',
          generation: 1,
        }),
      ).toBe(false);
    });
  });
});

describe('useVehicleLiveMapStore race safety', () => {
  beforeEach(() => {
    useVehicleLiveMapStore.getState().reset();
  });

  it('applies concurrent GPS and dashboard patches without losing fields', () => {
    useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
    const binding = { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 };

    useVehicleLiveMapStore.getState().patchIfBound(binding, {
      targetPosition: [9.4, 51.1],
      gpsSource: 'dimo',
    });
    useVehicleLiveMapStore.getState().patchIfBound(binding, {
      snapshot: BASE_SNAPSHOT,
      displayState: 'MOVING',
    });

    const state = useVehicleLiveMapStore.getState();
    expect(state.targetPosition).toEqual([9.4, 51.1]);
    expect(state.snapshot?.fuel).toBe(55);
    expect(state.displayState).toBe('MOVING');
  });

  it('ignores patches from stale generation after vehicle switch', () => {
    useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
    const staleBinding = { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 };

    useVehicleLiveMapStore.getState().bindToVehicle('veh-2', 'org-1', 2);
    useVehicleLiveMapStore.getState().patchIfBound(staleBinding, {
      targetPosition: [99, 99],
      snapshot: { ...BASE_SNAPSHOT, speed: 999 },
    });

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBe('veh-2');
    expect(state.targetPosition).toBeNull();
    expect(state.snapshot).toBeNull();
  });

  it('resets state on org change bind', () => {
    useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
    useVehicleLiveMapStore.getState().patchIfBound(
      { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 },
      { snapshot: BASE_SNAPSHOT, targetPosition: [9.4, 51.1] },
    );

    useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-2', 2);

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundOrgId).toBe('org-2');
    expect(state.boundGeneration).toBe(2);
    expect(state.snapshot).toBeNull();
    expect(state.targetPosition).toBeNull();
  });

  it('uses functional updater without stale closure reads', () => {
    useVehicleLiveMapStore.getState().bindToVehicle('veh-1', 'org-1', 1);
    const binding = { vehicleId: 'veh-1', orgId: 'org-1', generation: 1 };

    useVehicleLiveMapStore.getState().patchIfBound(binding, { speedKmh: 10 });
    useVehicleLiveMapStore.getState().patchIfBound(binding, (state) => ({
      speedKmh: (state.speedKmh ?? 0) + 5,
    }));

    expect(useVehicleLiveMapStore.getState().speedKmh).toBe(15);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  isStoreBoundToVehicle,
  useVehicleLiveMapStore,
} from './useVehicleLiveMapStore';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_1 = 'veh-1';
const VEH_2 = 'veh-2';

describe('useVehicleLiveMapStore — vehicle/tenant binding', () => {
  beforeEach(() => {
    useVehicleLiveMapStore.getState().reset();
  });

  it('starts unbound with offline defaults', () => {
    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBeNull();
    expect(state.boundOrgId).toBeNull();
    expect(state.onlineStatus).toBe('OFFLINE');
    expect(state.loading).toBe(false);
  });

  it('bindToVehicle resets state and scopes to vehicle + org', () => {
    useVehicleLiveMapStore.getState().patchState({
      targetPosition: [9, 51],
      error: 'stale',
      onlineStatus: 'ONLINE',
    });

    useVehicleLiveMapStore.getState().bindToVehicle(VEH_1, ORG_A);

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBe(VEH_1);
    expect(state.boundOrgId).toBe(ORG_A);
    expect(state.loading).toBe(true);
    expect(state.targetPosition).toBeNull();
    expect(state.error).toBeNull();
    expect(isStoreBoundToVehicle(state, VEH_1, ORG_A)).toBe(true);
    expect(isStoreBoundToVehicle(state, VEH_2, ORG_A)).toBe(false);
    expect(isStoreBoundToVehicle(state, VEH_1, ORG_B)).toBe(false);
  });

  it('patchIfBound ignores patches for a different vehicle (out-of-order guard)', () => {
    useVehicleLiveMapStore.getState().bindToVehicle(VEH_1, ORG_A);
    useVehicleLiveMapStore.getState().patchIfBound(VEH_2, ORG_A, {
      targetPosition: [8, 50],
      onlineStatus: 'ONLINE',
    });

    const state = useVehicleLiveMapStore.getState();
    expect(state.targetPosition).toBeNull();
    expect(state.onlineStatus).toBe('OFFLINE');
  });

  it('patchIfBound ignores patches for a different org (tenant isolation)', () => {
    useVehicleLiveMapStore.getState().bindToVehicle(VEH_1, ORG_A);
    useVehicleLiveMapStore.getState().patchIfBound(VEH_1, ORG_B, {
      targetPosition: [8, 50],
    });

    expect(useVehicleLiveMapStore.getState().targetPosition).toBeNull();
  });

  it('patchIfBound merges snapshot fields when bound', () => {
    useVehicleLiveMapStore.getState().bindToVehicle(VEH_1, ORG_A);
    useVehicleLiveMapStore.getState().patchIfBound(VEH_1, ORG_A, {
      targetPosition: [9.48, 51.31],
      lastSignal: '2026-07-24T10:00:00.000Z',
      signalAgeMs: 120_000,
      onlineStatus: 'STANDBY',
      loading: false,
    });

    const state = useVehicleLiveMapStore.getState();
    expect(state.targetPosition).toEqual([9.48, 51.31]);
    expect(state.lastSignal).toBe('2026-07-24T10:00:00.000Z');
    expect(state.signalAgeMs).toBe(120_000);
    expect(state.onlineStatus).toBe('STANDBY');
    expect(state.loading).toBe(false);
  });

  it('unbind clears all live map state', () => {
    useVehicleLiveMapStore.getState().bindToVehicle(VEH_1, ORG_A);
    useVehicleLiveMapStore.getState().patchIfBound(VEH_1, ORG_A, {
      targetPosition: [9, 51],
    });
    useVehicleLiveMapStore.getState().unbind();

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBeNull();
    expect(state.targetPosition).toBeNull();
  });
});

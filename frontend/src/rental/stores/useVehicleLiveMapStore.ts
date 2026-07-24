import { create } from 'zustand';
import type {
  DisplayIgnition,
  OnlineStatus,
  VehicleStateLabel,
} from '../../lib/liveMapUtils';
import type { LiveTelemetrySnapshot } from '../lib/telemetry-field-semantics';
import type { TelemetryFreshness } from '../lib/telemetryFreshness';
import {
  isVehicleLiveMapBindingCurrent,
  mergeVehicleLiveMapState,
  type VehicleLiveMapBinding,
} from '../lib/vehicle-live-map-store-merge';

export type LiveGpsSource = 'dimo' | 'cache' | null;

export type { LiveTelemetrySnapshot };

export interface VehicleLiveMapData {
  boundVehicleId: string | null;
  boundOrgId: string | null;
  boundGeneration: number;
  snapshot: LiveTelemetrySnapshot | null;
  targetPosition: [number, number] | null;
  lastConfirmedPosition: [number, number] | null;
  locationHistory: Array<[number, number]>;
  heading: number | null;
  gpsSource: LiveGpsSource;
  isLiveTracking: boolean;
  loading: boolean;
  error: string | null;
  speedKmh: number | null;
  lastLocationAt: number | null;
  isMoving: boolean;
  lastSignal: string;
  measuredAt: string | null;
  receivedAt: string | null;
  cachedAt: string | null;
  signalAgeMs: number | null;
  isFresh: boolean;
  telemetryFreshness: TelemetryFreshness;
  onlineStatus: OnlineStatus;
  displayState: VehicleStateLabel;
  displayIgnition: DisplayIgnition;
  displaySpeed: number | null;
  displayCoolant: number | null;
  displayEngineLoad: number | null;
  tripDetectionState: string | null;
}

export type VehicleLiveMapPatch =
  | Partial<VehicleLiveMapData>
  | ((state: VehicleLiveMapData) => Partial<VehicleLiveMapData>);

interface VehicleLiveMapStore extends VehicleLiveMapData {
  patchState: (patch: VehicleLiveMapPatch) => void;
  bindToVehicle: (vehicleId: string, orgId: string, generation: number) => void;
  patchIfBound: (binding: VehicleLiveMapBinding, patch: VehicleLiveMapPatch) => void;
  isBindingCurrent: (binding: VehicleLiveMapBinding) => boolean;
  unbind: () => void;
  reset: () => void;
}

function createInitialState(): VehicleLiveMapData {
  return {
    boundVehicleId: null,
    boundOrgId: null,
    boundGeneration: 0,
    snapshot: null,
    targetPosition: null,
    lastConfirmedPosition: null,
    locationHistory: [],
    heading: null,
    gpsSource: null,
    isLiveTracking: false,
    loading: false,
    error: null,
    speedKmh: null,
    lastLocationAt: null,
    isMoving: false,
    lastSignal: '',
    measuredAt: null,
    receivedAt: null,
    cachedAt: null,
    signalAgeMs: null,
    isFresh: false,
    telemetryFreshness: 'no_signal',
    onlineStatus: 'OFFLINE',
    displayState: 'PARKED',
    displayIgnition: 'UNKNOWN',
    displaySpeed: null,
    displayCoolant: null,
    displayEngineLoad: null,
    tripDetectionState: null,
  };
}

function resolvePatch(
  state: VehicleLiveMapData,
  patch: VehicleLiveMapPatch,
): Partial<VehicleLiveMapData> {
  return typeof patch === 'function' ? patch(state) : patch;
}

export function isStoreBoundToVehicle(
  state: Pick<VehicleLiveMapData, 'boundVehicleId' | 'boundOrgId'>,
  vehicleId: string | null,
  orgId: string | null,
): boolean {
  return (
    vehicleId != null &&
    orgId != null &&
    state.boundVehicleId === vehicleId &&
    state.boundOrgId === orgId
  );
}

export const useVehicleLiveMapStore = create<VehicleLiveMapStore>((set, get) => ({
  ...createInitialState(),
  patchState: (patch) =>
    set((state) => mergeVehicleLiveMapState(state, resolvePatch(state, patch))),
  bindToVehicle: (vehicleId, orgId, generation) =>
    set({
      ...createInitialState(),
      boundVehicleId: vehicleId,
      boundOrgId: orgId,
      boundGeneration: generation,
      loading: true,
    }),
  isBindingCurrent: (binding) => isVehicleLiveMapBindingCurrent(get(), binding),
  patchIfBound: (binding, patch) =>
    set((state) => {
      if (!isVehicleLiveMapBindingCurrent(state, binding)) return state;
      return mergeVehicleLiveMapState(state, resolvePatch(state, patch));
    }),
  unbind: () => set(createInitialState()),
  reset: () => set(createInitialState()),
}));

import { create } from 'zustand';
import type {
  DisplayIgnition,
  OnlineStatus,
  VehicleStateLabel,
} from '../../lib/liveMapUtils';
import type { LiveTelemetrySnapshot } from '../lib/telemetry-field-semantics';

export type LiveGpsSource = 'dimo' | 'cache' | null;

export type { LiveTelemetrySnapshot };

export interface VehicleLiveMapData {
  boundVehicleId: string | null;
  boundOrgId: string | null;
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
  onlineStatus: OnlineStatus;
  displayState: VehicleStateLabel;
  displayIgnition: DisplayIgnition;
  displaySpeed: number | null;
  displayCoolant: number | null;
  displayEngineLoad: number | null;
  tripDetectionState: string | null;
}

interface VehicleLiveMapStore extends VehicleLiveMapData {
  patchState: (patch: Partial<VehicleLiveMapData>) => void;
  bindToVehicle: (vehicleId: string, orgId: string) => void;
  patchIfBound: (
    vehicleId: string,
    orgId: string,
    patch: Partial<VehicleLiveMapData>,
  ) => void;
  unbind: () => void;
  reset: () => void;
}

function createInitialState(): VehicleLiveMapData {
  return {
    boundVehicleId: null,
    boundOrgId: null,
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
    onlineStatus: 'OFFLINE',
    displayState: 'PARKED',
    displayIgnition: 'UNKNOWN',
    displaySpeed: null,
    displayCoolant: null,
    displayEngineLoad: null,
    tripDetectionState: null,
  };
}

export function createDefaultLiveSnapshot(): LiveTelemetrySnapshot {
  return {
    speed: null,
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
    ignitionOn: false,
  };
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
  patchState: (patch) => set((state) => ({ ...state, ...patch })),
  bindToVehicle: (vehicleId, orgId) =>
    set({
      ...createInitialState(),
      boundVehicleId: vehicleId,
      boundOrgId: orgId,
      loading: true,
    }),
  patchIfBound: (vehicleId, orgId, patch) => {
    const state = get();
    if (state.boundVehicleId !== vehicleId || state.boundOrgId !== orgId) return;
    set({ ...state, ...patch });
  },
  unbind: () => set(createInitialState()),
  reset: () => set(createInitialState()),
}));

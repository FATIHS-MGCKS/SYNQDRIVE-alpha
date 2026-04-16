import { create } from 'zustand';
import type {
  DisplayIgnition,
  OnlineStatus,
  VehicleStateLabel,
} from '../../lib/liveMapUtils';

export type LiveGpsSource = 'dimo' | 'cache' | null;

export interface LiveTelemetrySnapshot {
  speed: number;
  fuel: number;
  coolant: number;
  battery: number;
  lvBatteryVoltage: number;
  odometer: number;
  engineLoad?: number;
  ignitionOn?: boolean;
}

export interface VehicleLiveMapData {
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
  signalAgeMs: number;
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
  reset: () => void;
}

function createInitialState(): VehicleLiveMapData {
  return {
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
    signalAgeMs: 0,
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
    speed: 0,
    fuel: 0,
    coolant: 0,
    battery: 0,
    lvBatteryVoltage: 0,
    odometer: 0,
    engineLoad: 0,
    ignitionOn: false,
  };
}

export const useVehicleLiveMapStore = create<VehicleLiveMapStore>((set) => ({
  ...createInitialState(),
  patchState: (patch) => set((state) => ({ ...state, ...patch })),
  reset: () => set(createInitialState()),
}));

export const selectLiveSnapshot = (state: VehicleLiveMapStore) => state.snapshot;
export const selectLiveTargetPosition = (state: VehicleLiveMapStore) =>
  state.targetPosition;
export const selectLiveLastConfirmedPosition = (state: VehicleLiveMapStore) =>
  state.lastConfirmedPosition;
export const selectLiveHeading = (state: VehicleLiveMapStore) => state.heading;
export const selectLiveGpsSource = (state: VehicleLiveMapStore) => state.gpsSource;
export const selectIsLiveTracking = (state: VehicleLiveMapStore) =>
  state.isLiveTracking;
export const selectLiveLoading = (state: VehicleLiveMapStore) => state.loading;
export const selectLiveError = (state: VehicleLiveMapStore) => state.error;


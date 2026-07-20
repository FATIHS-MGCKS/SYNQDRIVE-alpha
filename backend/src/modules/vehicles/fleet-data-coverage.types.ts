/**
 * Capability-aware fleet data coverage vocabulary.
 * Separates capability expectation, availability, freshness, and quality.
 */

export const FLEET_SIGNAL_KEYS = [
  'gps',
  'odometer',
  'speed',
  'fuel',
  'evSoc',
  'dtc',
  'obdPlug',
  'jamming',
] as const;
export type FleetSignalKey = (typeof FLEET_SIGNAL_KEYS)[number];

/** Capability expectation for a signal in the vehicle context. */
export const SignalCapabilityExpectation = {
  EXPECTED: 'EXPECTED',
  OPTIONAL: 'OPTIONAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNSUPPORTED: 'UNSUPPORTED',
} as const;
export type SignalCapabilityExpectation =
  (typeof SignalCapabilityExpectation)[keyof typeof SignalCapabilityExpectation];

/** Runtime signal status including availability and freshness dimensions. */
export const SignalRuntimeStatus = {
  EXPECTED: 'EXPECTED',
  OPTIONAL: 'OPTIONAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNSUPPORTED: 'UNSUPPORTED',
  AVAILABLE_FRESH: 'AVAILABLE_FRESH',
  AVAILABLE_STALE: 'AVAILABLE_STALE',
  HISTORICALLY_AVAILABLE: 'HISTORICALLY_AVAILABLE',
  MISSING: 'MISSING',
  UNKNOWN: 'UNKNOWN',
} as const;
export type SignalRuntimeStatus =
  (typeof SignalRuntimeStatus)[keyof typeof SignalRuntimeStatus];

export const FleetDataCoverageState = {
  GOOD: 'GOOD',
  PARTIAL: 'PARTIAL',
  INSUFFICIENT: 'INSUFFICIENT',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;
export type FleetDataCoverageState =
  (typeof FleetDataCoverageState)[keyof typeof FleetDataCoverageState];

export const FleetDataCoverageReasonCode = {
  DATA_COVERAGE_PARTIAL: 'DATA_COVERAGE_PARTIAL',
  DATA_COVERAGE_INSUFFICIENT: 'DATA_COVERAGE_INSUFFICIENT',
  SIGNAL_NOT_APPLICABLE: 'SIGNAL_NOT_APPLICABLE',
  TELEMETRY_STALE: 'TELEMETRY_STALE',
  NO_TELEMETRY_SNAPSHOT: 'NO_TELEMETRY_SNAPSHOT',
  CAPABILITY_UNKNOWN: 'CAPABILITY_UNKNOWN',
  PROVIDER_CHANGED: 'PROVIDER_CHANGED',
} as const;
export type FleetDataCoverageReasonCode =
  (typeof FleetDataCoverageReasonCode)[keyof typeof FleetDataCoverageReasonCode];

export type FleetProviderClass = 'DIMO' | 'HIGH_MOBILITY' | 'MANUAL' | 'NONE';
export type FleetDeviceClass = 'PHYSICAL_OBD' | 'OEM' | 'SYNTHETIC' | 'NONE';
export type FleetPowertrainClass = 'ICE' | 'EV' | 'PHEV' | 'UNKNOWN';

export interface FleetCoverageContext {
  provider: FleetProviderClass;
  deviceClass: FleetDeviceClass;
  powertrain: FleetPowertrainClass;
  physicalObdCapable: boolean;
  hasProviderLink: boolean;
  hasTelemetrySnapshot: boolean;
}

export interface FleetSignalObservationInput {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  odometerKm: number | null | undefined;
  speedKmh: number | null | undefined;
  fuelLevelRelative: number | null | undefined;
  fuelLevelAbsolute: number | null | undefined;
  evSoc: number | null | undefined;
  obdDtcList: unknown;
  lastDtcPollAt: Date | string | null | undefined;
  obdIsPluggedIn: boolean | null | undefined;
  jammingDetectedCount: number;
  hasTelemetry: boolean;
  rawSignals: Record<string, unknown> | null;
}

export interface FleetSignalCoverageDetail {
  key: FleetSignalKey;
  capability: SignalCapabilityExpectation;
  status: SignalRuntimeStatus;
}

export interface FleetDataCoverageResult {
  coverageState: FleetDataCoverageState;
  coveragePercent: number | null;
  expectedSignalCount: number;
  freshSignalCount: number;
  staleSignalCount: number;
  missingSignalCount: number;
  reasonCodes: FleetDataCoverageReasonCode[];
  signals: FleetSignalCoverageDetail[];
}

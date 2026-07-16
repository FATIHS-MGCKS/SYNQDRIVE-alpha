import type { TireDimoSignalName } from './tire-dimo-signal-capability';

export type TireDimoSignalUsability =
  | 'USABLE'
  | 'SPORADIC'
  | 'AVAILABLE_BUT_NO_HISTORICAL_VALUES'
  | 'DOCUMENTED_NOT_AVAILABLE'
  | 'BLOCKED';

export interface TireDimoSignalCapabilityResult {
  signalName: TireDimoSignalName;
  usable: boolean;
  usability: TireDimoSignalUsability;
  recommendation: 'MVP' | 'LATER' | 'DO_NOT_USE';
  reasons: string[];
  documentedInDimoSchema: boolean;
  listedInAvailableSignals: boolean;
  latestValueAvailable: boolean;
  historicalValuesAvailable: boolean;
  synqDrivePersistsSignal: boolean;
  synqDriveUsesSignal: boolean;
  sampleCount14d: number;
  coveragePercent: number | null;
  lastSeenAt: string | null;
  stale: boolean;
}

export interface AmbientTemperatureSample {
  timestamp: string;
  temperatureC: number;
  /** Distance weight proxy (km) when derived from trips; defaults to 1 for telemetry samples. */
  weightKm?: number;
}

export type AmbientSeasonBand = 'COLD' | 'MILD' | 'WARM';

export interface AmbientTemperatureContext {
  usable: boolean;
  /** Multi-day time-weighted ambient average in °C — never tire temperature. */
  weightedAvgTempC: number | null;
  sampleCount: number;
  windowDays: number;
  periodStart: string | null;
  periodEnd: string | null;
  lastSeenAt: string | null;
  stale: boolean;
  singleSpikeRejected: boolean;
  seasonBand: AmbientSeasonBand | null;
  pressureContextHintDe: string | null;
  pressureContextHintEn: string | null;
  reasons: string[];
}

export interface TireDimoOdometerContext {
  usable: boolean;
  valueKm: number | null;
  source: 'DIMO' | 'HIGH_MOBILITY' | 'VEHICLE_LATEST_STATE' | null;
  lastSeenAt: string | null;
  plausibilityOnly: boolean;
  reasons: string[];
}

export interface TireDimoTpmsCapabilityContext {
  /** Architecture prepared — fleet audit showed 0 % live coverage. */
  architecturePrepared: boolean;
  usable: boolean;
  signalPresent: boolean;
  warningActive: boolean | null;
  sourceTimestamp: string | null;
  reasons: string[];
}

/** Canonical DIMO tire context — capability-gated, honest about gaps. */
export interface TireDimoContext {
  asOf: string;
  signals: Partial<Record<TireDimoSignalName, TireDimoSignalCapabilityResult>>;
  ambient: AmbientTemperatureContext;
  odometer: TireDimoOdometerContext;
  tpms: TireDimoTpmsCapabilityContext;
  blockedWearDerivations: string[];
}

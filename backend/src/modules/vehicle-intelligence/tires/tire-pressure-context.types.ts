import type { DimoTirePressurePlausibility } from '@modules/dimo/dimo-tire-pressure.normalizer';

export type TirePressureFreshness = 'fresh' | 'aging' | 'stale' | 'no_data';

export type TirePressureSourceType =
  | 'DIMO'
  | 'HIGH_MOBILITY'
  | 'MIXED'
  | 'NONE';

export type TirePressureWheelProvider = 'DIMO' | 'HIGH_MOBILITY';

export type TirePressureWheelPosition =
  | 'frontLeft'
  | 'frontRight'
  | 'rearLeft'
  | 'rearRight';

export type TirePressureOverallStatus =
  | 'OK'
  | 'ISSUE'
  | 'STALE'
  | 'UNKNOWN';

export type TirePressureTpmsWarningSource =
  | 'DIMO'
  | 'HIGH_MOBILITY'
  | 'MIXED'
  | null;

export interface TirePressureWheelReading {
  value: number | null;
  normalizedUnit: 'BAR';
  sourceProvider: TirePressureWheelProvider | null;
  sourceTimestamp: string | null;
  freshness: TirePressureFreshness;
  plausibility: DimoTirePressurePlausibility;
  /** Structured HM wheel status token when available. */
  statusToken: string | null;
  /** True when structured status or OEM boolean indicates a pressure issue. */
  statusIssue: boolean;
}

export interface TirePressureCoverage {
  /** Wheels with any resolved reading (0–4). */
  wheelsAvailable: number;
  /** Wheels with fresh readings. */
  wheelsFresh: number;
  /** Wheels eligible for wear-factor input. */
  wheelsUsableForWear: number;
  /**
   * wheelsAvailable / 4 — never 100 % from a single wheel.
   */
  coveragePercent: number;
  periodStart: string | null;
  periodEnd: string | null;
  /** Span between oldest and newest wheel timestamps (minutes). */
  signalSpanMinutes: number | null;
  /**
   * False when data is stale — stale snapshots must not imply continuous
   * pressure exposure across recalculations.
   */
  continuousExposureEligible: boolean;
  minWheelsRequired: number;
  meetsWearThreshold: boolean;
}

export interface TirePressureWearEligibility {
  eligible: boolean;
  reasons: string[];
  confidencePenalty: number;
  measurementHint: string | null;
}

/**
 * Canonical tire pressure read model — single source for UI, rental health,
 * wear-factor gating, and confidence overlays.
 */
export interface TirePressureContext {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>;
  normalizedUnit: 'BAR';
  sourceType: TirePressureSourceType;
  overallFreshness: TirePressureFreshness;
  coverage: TirePressureCoverage;
  /**
   * Structured TPMS warning when a provider exposes it.
   * `null` = signal not present / capability unknown — not “no TPMS”.
   */
  tpmsWarning: boolean | null;
  tpmsWarningSource: TirePressureTpmsWarningSource;
  /** Nominal cold pressure used for deviation checks (bar). */
  nominalPressureBar: number | null;
  qualityWarnings: string[];
  wearEligibility: TirePressureWearEligibility;
  overallStatus: TirePressureOverallStatus;

  // ── Legacy compatibility (derived) ─────────────────────────────────────
  /** @deprecated use sourceType */
  source: TirePressureSourceType;
  dimoFreshness: TirePressureFreshness;
  hmFreshness: TirePressureFreshness;
  /** @deprecated use qualityWarnings */
  warningHints: string[];
}

export interface DimoTpmsWarningInput {
  signalPresent: boolean;
  value: boolean | null;
  sourceTimestamp: Date | null;
}

export interface DimoPressureSnapshotInput {
  tirePressureFl: number | null;
  tirePressureFr: number | null;
  tirePressureRl: number | null;
  tirePressureRr: number | null;
  providerSource: string | null;
  /** Vehicle-level DIMO fetch time — never tread measurement time. */
  sourceTimestamp: Date | null;
  providerFetchedAt: Date | null;
  lastSeenAt: Date | null;
  perWheelTimestamps?: Partial<
    Record<TirePressureWheelPosition, Date | null>
  >;
  tpmsWarning?: DimoTpmsWarningInput | null;
  capability?: {
    tirePressureSignalsListed?: boolean;
    tpmsWarningSignalListed?: boolean;
  };
}

export interface HmPressureSnapshotInput {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit?: string | null;
  statusFrontLeft?: string | null;
  statusFrontRight?: string | null;
  statusRearLeft?: string | null;
  statusRearRight?: string | null;
  overallStatus?: 'OK' | 'ISSUE' | 'UNKNOWN' | string;
  lastUpdatedAt?: string | null;
  freshnessStatus?: string | null;
  tirePressureWarning?: boolean | null;
}

export interface BuildTirePressureContextInput {
  asOf?: Date;
  dimo?: DimoPressureSnapshotInput | null;
  hm?: HmPressureSnapshotInput | null;
  nominalPressureBar?: number | null;
  minWheelsForWear?: number;
}

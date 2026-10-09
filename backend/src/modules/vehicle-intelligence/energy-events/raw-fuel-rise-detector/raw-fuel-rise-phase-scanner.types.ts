import type { RawFuelRisePhaseScannerCalibrationBundle } from './raw-fuel-rise-phase-scanner.policy';
import type { RawFuelRiseDetectorConfig } from './raw-fuel-rise-detector.config';

export type RawFuelRiseObservedPhase =
  | 'RISING'
  | 'PEAK_REACHED'
  | 'SETTLING'
  | 'SETTLED';

export type PhaseScannerMaturityStatus =
  | 'PROVISIONAL'
  | 'MATURE_SHADOW_READY'
  | 'HOLD'
  | 'REFUSED';

export type PhaseScannerHoldReason =
  | 'INVALID_CALIBRATION_BUNDLE'
  | 'TERMINAL_F3_DOMINANCE'
  | 'SENSOR_RESET'
  | 'TRUE_BASELINE_RETURN'
  | 'UNSTABLE_RISE'
  | 'SECOND_REFUEL_SEPARATED'
  | 'INSUFFICIENT_POST_PERSISTENCE'
  | 'MISSING_POST_SAMPLES'
  | 'STALE_PRE_BASELINE'
  | 'SETTLED_WINDOW_INTERNAL_GAP'
  | 'PEAK_SETTLED_CONTINUITY_GAP'
  | 'DELAYED_OBSERVATION_NOT_PHYSICAL_SETTLING'
  | 'CALIBRATION_BOUND_EXCEEDED'
  | 'NO_MATERIAL_RISE'
  | 'PHASE_INCOMPLETE'
  | 'PHASE_AWARE_REINTERPRETATION_ONLY';

export interface RawFuelRisePhaseTransition {
  phase: RawFuelRiseObservedPhase;
  at: Date;
  liters: number;
}

export interface RawFuelRisePhysicalIdentityAnchors {
  prePlateauBucket: number;
  riseOnsetAt: Date;
  signalChannel: 'ABSOLUTE_LITERS';
}

export interface RawFuelRisePhaseScannerStructuralSymbols {
  materialRiseLiters: number;
  postPlateauMinSamples: number;
  postPlateauToleranceLiters: number;
  postPlateauMinPersistenceMs: number;
  /** Settled-window strict internal gaps only (not peak→settled continuity). */
  settledWindowMaxInternalGapMs: number;
  negativeWobbleLiters: number;
  maxPostSearchAfterRiseEndMs: number;
}

export interface RawFuelRisePhaseScannerPreBaseline {
  medianLiters: number;
  fresh: boolean;
  staleReason: string | null;
}

export interface RawFuelRisePhaseScannerRiseAnchors {
  riseOnsetAt: Date;
  riseEndAt: Date;
}

export interface RawFuelRisePhaseScannerF3Context {
  lifecycleState: string;
  rejectionReason: string | null;
}

export interface RawFuelRisePhaseScannerSample {
  timestamp: Date;
  absoluteLiters: number;
}

export interface RawFuelRisePhaseScannerInput {
  samples: RawFuelRisePhaseScannerSample[];
  preBaseline: RawFuelRisePhaseScannerPreBaseline;
  riseAnchors: RawFuelRisePhaseScannerRiseAnchors;
  structuralSymbols: RawFuelRisePhaseScannerStructuralSymbols;
  calibrationBundle: RawFuelRisePhaseScannerCalibrationBundle | null;
  policyVersion: string;
  physicalIdentityAnchors: RawFuelRisePhysicalIdentityAnchors | null;
  f3Context: RawFuelRisePhaseScannerF3Context | null;
  evidenceProvenance: Record<string, unknown>;
}

export interface RawFuelRisePhaseScannerProposal {
  /** Shadow-only — does not mutate active F3 output. */
  proposedPostLiters: number | null;
  proposedDeltaLiters: number | null;
}

export interface RawFuelRisePhaseScannerResult {
  policyVersion: string;
  phaseTransitions: RawFuelRisePhaseTransition[];
  terminalPhase: RawFuelRiseObservedPhase | null;
  maturityStatus: PhaseScannerMaturityStatus;
  holdReason: PhaseScannerHoldReason | null;
  instantaneousPeakLiters: number | null;
  peakAt: Date | null;
  proposedSettledMedianLiters: number | null;
  settledWindowStart: Date | null;
  settledWindowEnd: Date | null;
  peakToSettledDropLiters: number | null;
  peakToSettledDropRatio: number | null;
  peakToSettledElapsedMs: number | null;
  maxPeakToSettledContinuityGapMs: number | null;
  physicalIdentityAnchors: RawFuelRisePhysicalIdentityAnchors | null;
  proposal: RawFuelRisePhaseScannerProposal;
  hypotheticalReinterpretation: boolean;
  calibrationProvenance: Record<string, unknown>;
  evidenceProvenance: Record<string, unknown>;
  separatedEpisodeCount: number;
}

export function buildStructuralSymbolsFromDetectorConfig(
  config: RawFuelRiseDetectorConfig,
): RawFuelRisePhaseScannerStructuralSymbols {
  return {
    materialRiseLiters: config.absolute.materialRiseLiters,
    postPlateauMinSamples: config.absolute.postPlateauMinSamples,
    postPlateauToleranceLiters: config.absolute.postPlateauToleranceLiters,
    postPlateauMinPersistenceMs: config.absolute.postPlateauMinPersistenceMs,
    settledWindowMaxInternalGapMs: config.absolute.maxSampleGapMs,
    negativeWobbleLiters: config.absolute.negativeWobbleLiters,
    maxPostSearchAfterRiseEndMs: config.riseMaxDurationMs,
  };
}

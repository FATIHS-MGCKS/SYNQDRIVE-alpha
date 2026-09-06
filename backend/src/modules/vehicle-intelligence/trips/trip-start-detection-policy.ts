import { isValidProviderEventTimestamp } from './trip-fsm-clock-contract';

/**
 * R4 — explicit two-phase start detection contract.
 *
 * PHASE A — START_CANDIDATE_WAKE (RESTING → POSSIBLE_START)
 * PHASE B — START_CONFIRMATION (POSSIBLE_START → ACTIVE_TRIP)
 *
 * Shared physical thresholds are reused by both phases; scoring authority is phase-specific.
 */

export const START_DETECTION_PHASES = {
  START_CANDIDATE_WAKE: 'START_CANDIDATE_WAKE',
  START_CONFIRMATION: 'START_CONFIRMATION',
} as const;

export type StartDetectionPhase =
  (typeof START_DETECTION_PHASES)[keyof typeof START_DETECTION_PHASES];

export interface SharedSignalThresholds {
  speedActiveKmh: number;
  speedMotionKmh: number;
  odometerMinDeltaKm: number;
  activeFrequencyPerMin: number;
  restingFrequencyPerMin: number;
}

export interface StartCandidateTriggerContract {
  minStrong: number;
  minStrongWithMovement: number;
  minWeak: number;
}

export interface StartCandidateConfidenceContract {
  highMinStrong: number;
  mediumMinStrong: number;
}

/** Declarative candidate signal increments — not confirmation weights. */
export interface StartCandidateSignalPolicy {
  ignitionOnStrongIncrement: number;
  engineLoadStrongThreshold: number;
  engineLoadStrongIncrement: number;
  engineLoadWeakIncrement: number;
  tractionDrawStrong2Kw: number;
  tractionDrawStrong1Kw: number;
  tractionDrawWeakKw: number;
  tractionRegenWeakMinKw: number;
  tractionRegenWeakMinSpeedKmh: number;
  tractionChargeWeakMinKw: number;
  tractionChargeWeakMaxSpeedKmh: number;
  gpsStrongMinM: number;
  gpsWeakMinM: number;
  fuelDeltaWeakMin: number;
  socDeltaStrongMin: number;
  socDeltaStrongForEvHybrid: boolean;
}

export interface StartCandidatePolicy {
  phase: typeof START_DETECTION_PHASES.START_CANDIDATE_WAKE;
  profile: string;
  shared: SharedSignalThresholds;
  signals: StartCandidateSignalPolicy;
  trigger: StartCandidateTriggerContract;
  confidence: StartCandidateConfidenceContract;
}

export interface StartConfirmationEvidenceWeights {
  ignitionWeight: number;
  speedWeight: number;
  odometerWeight: number;
  energyWeight: number;
  frequencyWeight: number;
}

export interface StartConfirmationPolicy {
  phase: typeof START_DETECTION_PHASES.START_CONFIRMATION;
  profile: string;
  shared: SharedSignalThresholds;
  evidenceWeights: StartConfirmationEvidenceWeights;
}

const SHARED_SIGNAL_THRESHOLDS: Record<string, SharedSignalThresholds> = {
  ICE: {
    speedActiveKmh: 5,
    speedMotionKmh: 0.5,
    odometerMinDeltaKm: 0.05,
    activeFrequencyPerMin: 2,
    restingFrequencyPerMin: 0.5,
  },
  EV: {
    speedActiveKmh: 3,
    speedMotionKmh: 0.5,
    odometerMinDeltaKm: 0.05,
    activeFrequencyPerMin: 2,
    restingFrequencyPerMin: 0.5,
  },
  HYBRID: {
    speedActiveKmh: 4,
    speedMotionKmh: 0.5,
    odometerMinDeltaKm: 0.05,
    activeFrequencyPerMin: 2,
    restingFrequencyPerMin: 0.5,
  },
  UNKNOWN: {
    speedActiveKmh: 5,
    speedMotionKmh: 0.5,
    odometerMinDeltaKm: 0.05,
    activeFrequencyPerMin: 2,
    restingFrequencyPerMin: 0.5,
  },
};

const CANDIDATE_SIGNAL_POLICY: Record<string, StartCandidateSignalPolicy> = {
  ICE: {
    ignitionOnStrongIncrement: 2,
    engineLoadStrongThreshold: 15,
    engineLoadStrongIncrement: 1,
    engineLoadWeakIncrement: 1,
    tractionDrawStrong2Kw: -25,
    tractionDrawStrong1Kw: -12,
    tractionDrawWeakKw: -4,
    tractionRegenWeakMinKw: 12,
    tractionRegenWeakMinSpeedKmh: 8,
    tractionChargeWeakMinKw: 5,
    tractionChargeWeakMaxSpeedKmh: 2,
    gpsStrongMinM: 50,
    gpsWeakMinM: 15,
    fuelDeltaWeakMin: 0.2,
    socDeltaStrongMin: 0.5,
    socDeltaStrongForEvHybrid: false,
  },
  EV: {
    ignitionOnStrongIncrement: 1,
    engineLoadStrongThreshold: 15,
    engineLoadStrongIncrement: 0,
    engineLoadWeakIncrement: 1,
    tractionDrawStrong2Kw: -25,
    tractionDrawStrong1Kw: -12,
    tractionDrawWeakKw: -4,
    tractionRegenWeakMinKw: 12,
    tractionRegenWeakMinSpeedKmh: 8,
    tractionChargeWeakMinKw: 5,
    tractionChargeWeakMaxSpeedKmh: 2,
    gpsStrongMinM: 50,
    gpsWeakMinM: 15,
    fuelDeltaWeakMin: 0.2,
    socDeltaStrongMin: 0.5,
    socDeltaStrongForEvHybrid: true,
  },
  HYBRID: {
    ignitionOnStrongIncrement: 2,
    engineLoadStrongThreshold: 15,
    engineLoadStrongIncrement: 1,
    engineLoadWeakIncrement: 1,
    tractionDrawStrong2Kw: -25,
    tractionDrawStrong1Kw: -12,
    tractionDrawWeakKw: -4,
    tractionRegenWeakMinKw: 12,
    tractionRegenWeakMinSpeedKmh: 8,
    tractionChargeWeakMinKw: 5,
    tractionChargeWeakMaxSpeedKmh: 2,
    gpsStrongMinM: 50,
    gpsWeakMinM: 15,
    fuelDeltaWeakMin: 0.2,
    socDeltaStrongMin: 0.5,
    socDeltaStrongForEvHybrid: true,
  },
  UNKNOWN: {
    ignitionOnStrongIncrement: 1,
    engineLoadStrongThreshold: 15,
    engineLoadStrongIncrement: 1,
    engineLoadWeakIncrement: 1,
    tractionDrawStrong2Kw: -25,
    tractionDrawStrong1Kw: -12,
    tractionDrawWeakKw: -4,
    tractionRegenWeakMinKw: 12,
    tractionRegenWeakMinSpeedKmh: 8,
    tractionChargeWeakMinKw: 5,
    tractionChargeWeakMaxSpeedKmh: 2,
    gpsStrongMinM: 50,
    gpsWeakMinM: 15,
    fuelDeltaWeakMin: 0.2,
    socDeltaStrongMin: 0.5,
    socDeltaStrongForEvHybrid: false,
  },
};

const CANDIDATE_TRIGGER: StartCandidateTriggerContract = {
  minStrong: 2,
  minStrongWithMovement: 1,
  minWeak: 3,
};

const CANDIDATE_CONFIDENCE: StartCandidateConfidenceContract = {
  highMinStrong: 3,
  mediumMinStrong: 2,
};

const CONFIRMATION_EVIDENCE_WEIGHTS: Record<string, StartConfirmationEvidenceWeights> =
  {
    ICE: {
      ignitionWeight: 3,
      speedWeight: 2,
      odometerWeight: 2,
      energyWeight: 1,
      frequencyWeight: 1,
    },
    EV: {
      ignitionWeight: 1,
      speedWeight: 3,
      odometerWeight: 2,
      energyWeight: 2,
      frequencyWeight: 2,
    },
    HYBRID: {
      ignitionWeight: 2,
      speedWeight: 3,
      odometerWeight: 2,
      energyWeight: 2,
      frequencyWeight: 1,
    },
    UNKNOWN: {
      ignitionWeight: 2,
      speedWeight: 3,
      odometerWeight: 2,
      energyWeight: 1,
      frequencyWeight: 2,
    },
  };

export const LIVE_START_STALE_THRESHOLD_MS = 90_000;

export type LiveStartFreshnessState =
  | 'FRESH'
  | 'STALE'
  | 'MISSING'
  | 'INVALID_TIMESTAMP';

export type LiveStartTimestampSource =
  | 'PROVIDER_EVENT_TIME'
  | 'NONE'
  | 'INVALID_PROVIDER';

export interface LiveStartFreshnessAssessment {
  state: LiveStartFreshnessState;
  snapshotFreshMs: number | null;
  timestampSource: LiveStartTimestampSource;
  providerSourceTimestamp: Date | null;
}

function resolveProfileKey(profile: string): string {
  return SHARED_SIGNAL_THRESHOLDS[profile] ? profile : 'UNKNOWN';
}

export function getSharedSignalThresholds(profile: string): SharedSignalThresholds {
  return SHARED_SIGNAL_THRESHOLDS[resolveProfileKey(profile)];
}

export function getStartCandidatePolicy(profile: string): StartCandidatePolicy {
  const key = resolveProfileKey(profile);
  return {
    phase: START_DETECTION_PHASES.START_CANDIDATE_WAKE,
    profile: key,
    shared: SHARED_SIGNAL_THRESHOLDS[key],
    signals: CANDIDATE_SIGNAL_POLICY[key],
    trigger: CANDIDATE_TRIGGER,
    confidence: CANDIDATE_CONFIDENCE,
  };
}

export function getStartConfirmationPolicy(profile: string): StartConfirmationPolicy {
  const key = resolveProfileKey(profile);
  return {
    phase: START_DETECTION_PHASES.START_CONFIRMATION,
    profile: key,
    shared: SHARED_SIGNAL_THRESHOLDS[key],
    evidenceWeights: CONFIRMATION_EVIDENCE_WEIGHTS[key],
  };
}

/** Backward-compatible merged view — confirmation weights are NOT candidate authority. */
export function getLegacyProfileThresholds(profile: string) {
  const shared = getSharedSignalThresholds(profile);
  const weights = CONFIRMATION_EVIDENCE_WEIGHTS[resolveProfileKey(profile)];
  return { ...shared, ...weights };
}

/**
 * EVENT_TIME freshness for LIVE_START. DB updatedAt is never treated as provider truth.
 */
export function assessLiveStartSnapshotFreshness(params: {
  providerSourceTimestamp: Date | null | undefined;
  workerNow?: Date;
  staleThresholdMs?: number;
}): LiveStartFreshnessAssessment {
  const workerNow = params.workerNow ?? new Date();
  const staleThresholdMs = params.staleThresholdMs ?? LIVE_START_STALE_THRESHOLD_MS;
  const providerSourceTimestamp = params.providerSourceTimestamp ?? null;

  if (!providerSourceTimestamp) {
    return {
      state: 'MISSING',
      snapshotFreshMs: null,
      timestampSource: 'NONE',
      providerSourceTimestamp: null,
    };
  }

  if (!isValidProviderEventTimestamp(providerSourceTimestamp, workerNow)) {
    return {
      state: 'INVALID_TIMESTAMP',
      snapshotFreshMs: null,
      timestampSource: 'INVALID_PROVIDER',
      providerSourceTimestamp,
    };
  }

  const snapshotFreshMs = workerNow.getTime() - providerSourceTimestamp.getTime();
  if (snapshotFreshMs < 0) {
    return {
      state: 'INVALID_TIMESTAMP',
      snapshotFreshMs: null,
      timestampSource: 'INVALID_PROVIDER',
      providerSourceTimestamp,
    };
  }

  return {
    state: snapshotFreshMs < staleThresholdMs ? 'FRESH' : 'STALE',
    snapshotFreshMs,
    timestampSource: 'PROVIDER_EVENT_TIME',
    providerSourceTimestamp,
  };
}

export function isLiveStartCandidateEligible(
  freshness: LiveStartFreshnessAssessment,
): boolean {
  return freshness.state === 'FRESH';
}

export type SpeedMotionBand = 'none' | 'weak' | 'strong';

export function classifySpeedMotionBand(
  speedKmh: number,
  shared: SharedSignalThresholds,
): SpeedMotionBand {
  if (speedKmh <= shared.speedMotionKmh) return 'none';
  if (speedKmh <= shared.speedActiveKmh) return 'weak';
  return 'strong';
}

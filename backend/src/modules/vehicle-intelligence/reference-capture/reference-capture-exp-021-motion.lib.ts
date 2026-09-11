/**
 * EXP-021 — motion authority, freshness, physical-drive phase validity, and
 * prospective end-candidate helpers. Used by autonomous orchestrator and tests.
 */

export type MotionState = 'MOVING' | 'PARKED_CANDIDATE' | 'UNKNOWN';

export type SpeedAuthorityField = 'speed' | 'currentSpeed';

export type SpeedSample = {
  speedKmh: number | null;
  speedProviderField: SpeedAuthorityField | null;
  speedTimestamp: string | null;
  speedAgeMs: number | null;
  speedUnit: 'km/h';
  vehicleTelemetryFresh: boolean;
  speedSignalFresh: boolean;
};

export type TelemetryFreshnessConfig = {
  vehicleTelemetryFreshThresholdMs: number;
  speedSignalFreshThresholdMs: number;
};

export const EXP021_DEFAULT_TELEMETRY_FRESHNESS: TelemetryFreshnessConfig = {
  vehicleTelemetryFreshThresholdMs: 600_000,
  speedSignalFreshThresholdMs: 120_000,
};

const SPEED_FIELDS: SpeedAuthorityField[] = ['speed', 'currentSpeed'];

export function parseSpeedSampleFromSignalsLatest(
  signalsLatest: Record<string, { timestamp?: string; value?: unknown }>,
  nowMs: number,
  freshness: TelemetryFreshnessConfig = EXP021_DEFAULT_TELEMETRY_FRESHNESS,
): SpeedSample {
  let latestAnyTimestamp: string | null = null;
  for (const entry of Object.values(signalsLatest)) {
    if (!entry?.timestamp) continue;
    if (!latestAnyTimestamp || entry.timestamp > latestAnyTimestamp) {
      latestAnyTimestamp = entry.timestamp;
    }
  }
  const vehicleTelemetryFresh =
    latestAnyTimestamp != null &&
    nowMs - Date.parse(latestAnyTimestamp) <= freshness.vehicleTelemetryFreshThresholdMs;

  let speedProviderField: SpeedAuthorityField | null = null;
  let speedTimestamp: string | null = null;
  let speedKmh: number | null = null;

  for (const field of SPEED_FIELDS) {
    const entry = signalsLatest[field];
    if (!entry?.timestamp) continue;
    const raw = entry.value;
    let parsed: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) parsed = raw;
    else if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number.parseFloat(raw);
      if (Number.isFinite(n)) parsed = n;
    }
    if (parsed == null) continue;
    if (!speedTimestamp || entry.timestamp > speedTimestamp) {
      speedTimestamp = entry.timestamp;
      speedProviderField = field;
      speedKmh = parsed;
    }
  }

  const speedAgeMs =
    speedTimestamp != null ? Math.max(0, nowMs - Date.parse(speedTimestamp)) : null;
  const speedSignalFresh =
    speedAgeMs != null && speedAgeMs <= freshness.speedSignalFreshThresholdMs;

  return {
    speedKmh,
    speedProviderField,
    speedTimestamp,
    speedAgeMs,
    speedUnit: 'km/h',
    vehicleTelemetryFresh,
    speedSignalFresh,
  };
}

export function classifyMotionState(
  sample: Pick<SpeedSample, 'speedKmh' | 'speedSignalFresh'>,
  parkedSpeedKmh: number,
  movementSpeedKmh: number,
): MotionState {
  if (sample.speedKmh == null || !sample.speedSignalFresh) {
    return 'UNKNOWN';
  }
  if (sample.speedKmh >= movementSpeedKmh) {
    return 'MOVING';
  }
  if (sample.speedKmh < parkedSpeedKmh) {
    return 'PARKED_CANDIDATE';
  }
  return 'UNKNOWN';
}

export type PhysicalStartDetectorConfig = {
  movementSpeedKmh: number;
  minDistinctFreshSamples: number;
  minDistinctTimestamps: number;
  maxSampleAgeMs: number;
  /** Sliding window for qualifying movement samples. */
  confirmationWindowMs: number;
  /** Sustained parked/non-moving duration that resets pre-start progress. */
  sustainedParkingResetMs: number;
};

export const EXP021_DEFAULT_PHYSICAL_START: PhysicalStartDetectorConfig = {
  movementSpeedKmh: 8,
  minDistinctFreshSamples: 4,
  minDistinctTimestamps: 3,
  maxSampleAgeMs: 120_000,
  confirmationWindowMs: 180_000,
  sustainedParkingResetMs: 90_000,
};

type StartWindowSample = {
  timestamp: string;
  timestampMs: number;
};

export type PhysicalStartConfirmation = {
  firstQualifyingMovementAt: Date;
  startConfirmedAt: Date;
  startDetectionLatencyMs: number;
};

/**
 * Urban-tolerant physical start: brief PARKED/UNKNOWN between moving samples does not
 * erase prior progress; only sustained pre-drive parking resets.
 */
export class PhysicalStartDetector {
  private readonly seenTimestamps = new Set<string>();
  private readonly windowSamples: StartWindowSample[] = [];
  private sustainedNonMovingSinceMs: number | null = null;
  private firstQualifyingMovementAtMs: number | null = null;
  private confirmed: PhysicalStartConfirmation | null = null;

  constructor(private readonly config: PhysicalStartDetectorConfig) {}

  reset(): void {
    this.seenTimestamps.clear();
    this.windowSamples.length = 0;
    this.sustainedNonMovingSinceMs = null;
    this.firstQualifyingMovementAtMs = null;
    this.confirmed = null;
  }

  private pruneWindow(nowMs: number): void {
    const cutoff = nowMs - this.config.confirmationWindowMs;
    while (this.windowSamples.length > 0 && this.windowSamples[0].timestampMs < cutoff) {
      const removed = this.windowSamples.shift()!;
      this.seenTimestamps.delete(removed.timestamp);
    }
    this.recomputeFirstQualifyingMovementAt();
  }

  private recomputeFirstQualifyingMovementAt(): void {
    if (this.windowSamples.length === 0) {
      this.firstQualifyingMovementAtMs = null;
      return;
    }
    this.firstQualifyingMovementAtMs = this.windowSamples.reduce(
      (min, sample) => Math.min(min, sample.timestampMs),
      this.windowSamples[0].timestampMs,
    );
  }

  private maybeResetForSustainedParking(nowMs: number, motionState: MotionState): void {
    if (motionState === 'MOVING') {
      this.sustainedNonMovingSinceMs = null;
      return;
    }
    if (motionState === 'PARKED_CANDIDATE') {
      if (this.sustainedNonMovingSinceMs == null) {
        this.sustainedNonMovingSinceMs = nowMs;
      } else if (nowMs - this.sustainedNonMovingSinceMs >= this.config.sustainedParkingResetMs) {
        this.reset();
      }
      return;
    }
    // UNKNOWN alone does not reset; only track if we already had sustained parking clock.
  }

  record(sample: SpeedSample, nowMs: number, motionState: MotionState): void {
    if (this.confirmed) return;

    this.pruneWindow(nowMs);
    this.maybeResetForSustainedParking(nowMs, motionState);

    if (motionState !== 'MOVING') {
      return;
    }
    if (sample.speedKmh == null || sample.speedTimestamp == null) {
      return;
    }
    if (sample.speedAgeMs == null || sample.speedAgeMs > this.config.maxSampleAgeMs) {
      return;
    }
    if (sample.speedKmh < this.config.movementSpeedKmh) {
      return;
    }
    if (this.seenTimestamps.has(sample.speedTimestamp)) {
      return;
    }

    const timestampMs = Date.parse(sample.speedTimestamp);
    this.seenTimestamps.add(sample.speedTimestamp);
    this.windowSamples.push({ timestamp: sample.speedTimestamp, timestampMs });
    this.pruneWindow(nowMs);
    this.recomputeFirstQualifyingMovementAt();

    if (
      this.windowSamples.length >= this.config.minDistinctFreshSamples &&
      this.seenTimestamps.size >= this.config.minDistinctTimestamps &&
      this.firstQualifyingMovementAtMs != null
    ) {
      this.confirmed = {
        firstQualifyingMovementAt: new Date(this.firstQualifyingMovementAtMs),
        startConfirmedAt: new Date(nowMs),
        startDetectionLatencyMs: nowMs - this.firstQualifyingMovementAtMs,
      };
    }
  }

  isConfirmed(): boolean {
    return this.confirmed != null;
  }

  getConfirmation(): PhysicalStartConfirmation | null {
    return this.confirmed;
  }

  getQualifyingSampleCount(): number {
    return this.windowSamples.length;
  }
}

export type PhysicalEndCandidateStatus = 'PROVISIONAL' | 'CONFIRMED' | 'INVALIDATED';

export type PhysicalEndCandidateRecord = {
  candidateId: string;
  candidateBoundaryAt: Date;
  candidateDetectedAt: Date;
  candidateStatus: PhysicalEndCandidateStatus;
  scheduleCreatedAt: Date | null;
  prospectiveAtCreationForAgeMs: (ageMs: number, scheduleCreatedAt: Date) => boolean;
};

export type PhysicalEndDetectorConfig = {
  parkedSpeedKmh: number;
  movementSpeedKmh: number;
  provisionalConfirmMs: number;
  finalParkedMs: number;
  maxSampleAgeMs: number;
  /** Distinct fresh parked provider timestamps required before UNKNOWN may auto-stop. */
  minDistinctParkedSamples: number;
};

export const EXP021_DEFAULT_PHYSICAL_END: PhysicalEndDetectorConfig = {
  parkedSpeedKmh: 3,
  movementSpeedKmh: 8,
  provisionalConfirmMs: 120_000,
  finalParkedMs: 600_000,
  maxSampleAgeMs: 120_000,
  minDistinctParkedSamples: 2,
};

export type PreDeployMovementGateConfig = {
  movementSpeedKmh: number;
  minDistinctFreshSamples: number;
  maxSampleAgeMs: number;
  /** Sliding window for qualifying movement samples (mirrors PhysicalStartDetector). */
  confirmationWindowMs: number;
  /** Sustained parked/non-moving duration that resets pre-deploy movement progress. */
  sustainedParkingResetMs: number;
};

export const EXP021_DEFAULT_PRE_DEPLOY_MOVEMENT: PreDeployMovementGateConfig = {
  movementSpeedKmh: 8,
  minDistinctFreshSamples: 3,
  maxSampleAgeMs: 120_000,
  confirmationWindowMs: EXP021_DEFAULT_PHYSICAL_START.confirmationWindowMs,
  sustainedParkingResetMs: EXP021_DEFAULT_PHYSICAL_START.sustainedParkingResetMs,
};

type PreDeployWindowSample = {
  timestamp: string;
  timestampMs: number;
};

/**
 * Pre-deploy movement gate — distinct provider speed timestamps inside a bounded
 * confirmation window. Sustained PARKED resets progress; UNKNOWN alone does not.
 */
export class PreDeployMovementGate {
  private readonly seenTimestamps = new Set<string>();
  private readonly windowSamples: PreDeployWindowSample[] = [];
  private sustainedNonMovingSinceMs: number | null = null;

  constructor(private readonly config: PreDeployMovementGateConfig) {}

  reset(): void {
    this.seenTimestamps.clear();
    this.windowSamples.length = 0;
    this.sustainedNonMovingSinceMs = null;
  }

  private pruneWindow(nowMs: number): void {
    const cutoff = nowMs - this.config.confirmationWindowMs;
    while (this.windowSamples.length > 0 && this.windowSamples[0].timestampMs < cutoff) {
      const removed = this.windowSamples.shift()!;
      this.seenTimestamps.delete(removed.timestamp);
    }
  }

  private maybeResetForSustainedParking(nowMs: number, motionState: MotionState): void {
    if (motionState === 'MOVING') {
      this.sustainedNonMovingSinceMs = null;
      return;
    }
    if (motionState === 'PARKED_CANDIDATE') {
      if (this.sustainedNonMovingSinceMs == null) {
        this.sustainedNonMovingSinceMs = nowMs;
      } else if (nowMs - this.sustainedNonMovingSinceMs >= this.config.sustainedParkingResetMs) {
        this.reset();
      }
      return;
    }
    // UNKNOWN alone does not reset; only track if we already had sustained parking clock.
  }

  record(sample: SpeedSample, motionState: MotionState, nowMs: number): void {
    this.pruneWindow(nowMs);
    this.maybeResetForSustainedParking(nowMs, motionState);

    if (motionState !== 'MOVING') {
      return;
    }
    if (sample.speedKmh == null || sample.speedTimestamp == null) {
      return;
    }
    if (sample.speedAgeMs == null || sample.speedAgeMs > this.config.maxSampleAgeMs) {
      return;
    }
    if (sample.speedKmh < this.config.movementSpeedKmh) {
      return;
    }
    if (this.seenTimestamps.has(sample.speedTimestamp)) {
      return;
    }

    const timestampMs = Date.parse(sample.speedTimestamp);
    this.seenTimestamps.add(sample.speedTimestamp);
    this.windowSamples.push({ timestamp: sample.speedTimestamp, timestampMs });
    this.pruneWindow(nowMs);
  }

  isDriveStartBeforeDeploy(): boolean {
    return this.windowSamples.length >= this.config.minDistinctFreshSamples;
  }

  getDistinctSampleCount(): number {
    return this.windowSamples.length;
  }
}

/**
 * Prospective physical end detector. UNKNOWN alone never initiates a candidate; after a
 * provisional parked boundary exists, telemetry staleness does not destroy it.
 */
export class PhysicalEndDetector {
  private candidate: PhysicalEndCandidateRecord | null = null;
  private provisionalSustainSinceMs: number | null = null;
  private finalParkedSinceMs: number | null = null;
  private readonly distinctParkedTimestamps = new Set<string>();
  private strongParkedEvidence = false;

  constructor(private readonly config: PhysicalEndDetectorConfig) {}

  getCandidate(): PhysicalEndCandidateRecord | null {
    return this.candidate;
  }

  private boundaryFromSample(sample: SpeedSample): Date | null {
    if (!sample.speedTimestamp) return null;
    const ms = Date.parse(sample.speedTimestamp);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  observe(
    sample: SpeedSample,
    motionState: MotionState,
    nowMs: number,
  ): {
    newProvisionalCandidate: PhysicalEndCandidateRecord | null;
    candidateInvalidated: boolean;
    candidateConfirmed: boolean;
    shouldAutoStop: boolean;
  } {
    let newProvisionalCandidate: PhysicalEndCandidateRecord | null = null;
    let candidateInvalidated = false;
    let candidateConfirmed = false;

    if (motionState === 'MOVING') {
      if (this.candidate && this.candidate.candidateStatus !== 'INVALIDATED') {
        this.candidate = {
          ...this.candidate,
          candidateStatus: 'INVALIDATED',
        };
        candidateInvalidated = true;
      }
      this.provisionalSustainSinceMs = null;
      this.finalParkedSinceMs = null;
      this.distinctParkedTimestamps.clear();
      this.strongParkedEvidence = false;
      return {
        newProvisionalCandidate: null,
        candidateInvalidated,
        candidateConfirmed: false,
        shouldAutoStop: false,
      };
    }

    if (motionState === 'PARKED_CANDIDATE' && sample.speedSignalFresh) {
      if (sample.speedTimestamp && !this.distinctParkedTimestamps.has(sample.speedTimestamp)) {
        this.distinctParkedTimestamps.add(sample.speedTimestamp);
      }
      if (this.distinctParkedTimestamps.size >= this.config.minDistinctParkedSamples) {
        this.strongParkedEvidence = true;
      }
      const boundary = this.boundaryFromSample(sample) ?? new Date(nowMs);

      if (!this.candidate || this.candidate.candidateStatus === 'INVALIDATED') {
        const candidateId = `pdi-${boundary.getTime()}`;
        this.candidate = {
          candidateId,
          candidateBoundaryAt: boundary,
          candidateDetectedAt: new Date(nowMs),
          candidateStatus: 'PROVISIONAL',
          scheduleCreatedAt: null,
          prospectiveAtCreationForAgeMs: (ageMs, scheduleCreatedAt) =>
            scheduleCreatedAt.getTime() <= boundary.getTime() + ageMs,
        };
        newProvisionalCandidate = this.candidate;
        this.provisionalSustainSinceMs = nowMs;
        this.finalParkedSinceMs = nowMs;
      } else if (this.provisionalSustainSinceMs == null) {
        this.provisionalSustainSinceMs = nowMs;
      }
      if (this.finalParkedSinceMs == null) {
        this.finalParkedSinceMs = nowMs;
      }

      if (
        this.candidate.candidateStatus === 'PROVISIONAL' &&
        this.provisionalSustainSinceMs != null &&
        nowMs - this.provisionalSustainSinceMs >= this.config.provisionalConfirmMs
      ) {
        this.candidate = { ...this.candidate, candidateStatus: 'CONFIRMED' };
        candidateConfirmed = true;
      }
    } else if (motionState === 'UNKNOWN') {
      // UNKNOWN is not parked/ignition authority — preserve candidate only.
      if (this.candidate && this.finalParkedSinceMs == null) {
        this.finalParkedSinceMs = nowMs;
      }
    }

    const shouldAutoStop =
      this.shouldAutoStopRecording(nowMs, motionState);

    return {
      newProvisionalCandidate,
      candidateInvalidated,
      candidateConfirmed,
      shouldAutoStop,
    };
  }

  markSchedulesCreated(scheduleCreatedAt: Date): void {
    if (!this.candidate) return;
    this.candidate = { ...this.candidate, scheduleCreatedAt };
  }

  /**
   * EXP-021 hard physical-end authority (orchestrator terminalization only).
   *
   * Stricter than {@link shouldAutoStopRecording}: requires current fresh PARKED_CANDIDATE
   * evidence sustained for finalParkedMs. UNKNOWN / stale telemetry never authorizes hard end.
   * Provisional CONFIRMED and strongParkedEvidence remain evidence-only.
   */
  hardPhysicalEndEligible(nowMs: number, motionState: MotionState): boolean {
    if (!this.candidate || this.candidate.candidateStatus === 'INVALIDATED') {
      return false;
    }
    if (motionState !== 'PARKED_CANDIDATE') {
      return false;
    }
    return (
      this.finalParkedSinceMs != null &&
      nowMs - this.finalParkedSinceMs >= this.config.finalParkedMs
    );
  }

  shouldAutoStopRecording(nowMs: number, motionState: MotionState): boolean {
    if (!this.candidate || this.candidate.candidateStatus === 'INVALIDATED') {
      return false;
    }

    if (
      motionState === 'PARKED_CANDIDATE' &&
      this.finalParkedSinceMs != null &&
      nowMs - this.finalParkedSinceMs >= this.config.finalParkedMs
    ) {
      return true;
    }

    // Telemetry dropout may auto-stop only after STRONG distinct parked evidence — not one sample.
    if (
      motionState === 'UNKNOWN' &&
      this.strongParkedEvidence &&
      (this.candidate.candidateStatus === 'CONFIRMED' ||
        (this.provisionalSustainSinceMs != null &&
          nowMs - this.provisionalSustainSinceMs >= this.config.provisionalConfirmMs))
    ) {
      return true;
    }

    return false;
  }
}

export type PhaseValidityRecord = {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndedAtMs: number | null;
  wallDurationMs: number;
  validMovementDurationMs: number;
  uncertainMovementDurationMs: number;
  motionCoveragePercent: number;
  scientificallyValid: boolean;
  phaseCompletion: 'SATISFIED' | 'INCOMPLETE';
  advancementMode: PhaseAdvancementMode;
  targetWallDurationMs: number | null;
  requiredMovementMs: number | null;
};

export type PhaseAdvancementMode = 'MOVING_ACCUMULATION' | 'WALL_CLOCK';

export type PhaseAdvancementConfig =
  | { mode: 'MOVING_ACCUMULATION'; requiredMovementMs: number }
  | {
      mode: 'WALL_CLOCK';
      targetWallDurationMs: number;
      /** Run-level grace budget (ms); consumed only when wall target is met. */
      graceBudgetMs?: number;
    };

export class PhysicalDrivePhaseTracker {
  private currentPhasePollMs: number | null = null;
  private phaseStartedAtMs: number | null = null;
  private advancement: PhaseAdvancementConfig | null = null;
  private movementAccumulatedMs = 0;
  private uncertainMovementDurationMs = 0;
  private lastTickMs: number | null = null;
  private lastMotionState: MotionState | null = null;
  private physicalDriveEnded = false;
  private graceConsumedMs = 0;
  private readonly completed: PhaseValidityRecord[] = [];

  beginPhase(pollMs: number, startedAtMs: number, advancement: PhaseAdvancementConfig): void {
    this.currentPhasePollMs = pollMs;
    this.phaseStartedAtMs = startedAtMs;
    this.advancement = advancement;
    this.movementAccumulatedMs = 0;
    this.uncertainMovementDurationMs = 0;
    this.lastTickMs = startedAtMs;
    this.lastMotionState = null;
  }

  /** @deprecated Use beginPhase(pollMs, startedAtMs, { mode: 'MOVING_ACCUMULATION', requiredMovementMs }). */
  beginPhaseWithMovementRequirement(
    pollMs: number,
    startedAtMs: number,
    requiredMovementMs: number,
  ): void {
    this.beginPhase(pollMs, startedAtMs, {
      mode: 'MOVING_ACCUMULATION',
      requiredMovementMs,
    });
  }

  tick(motionState: MotionState, nowMs: number): void {
    if (this.phaseStartedAtMs == null || this.physicalDriveEnded) {
      return;
    }
    if (this.lastTickMs != null) {
      const delta = Math.max(0, nowMs - this.lastTickMs);
      // Fail-closed: only credit MOVING when both boundary observations are MOVING.
      if (this.lastMotionState === 'MOVING' && motionState === 'MOVING') {
        this.movementAccumulatedMs += delta;
      } else if (motionState === 'MOVING' || this.lastMotionState === 'MOVING') {
        this.uncertainMovementDurationMs += delta;
      }
    }
    this.lastTickMs = nowMs;
    this.lastMotionState = motionState;
  }

  isPhaseSatisfied(nowMs?: number): boolean {
    if (!this.advancement || this.phaseStartedAtMs == null) return false;
    if (this.advancement.mode === 'WALL_CLOCK') {
      const elapsed = (nowMs ?? this.lastTickMs ?? this.phaseStartedAtMs) - this.phaseStartedAtMs;
      return elapsed >= this.advancement.targetWallDurationMs;
    }
    return this.movementAccumulatedMs >= this.advancement.requiredMovementMs;
  }

  shouldAdvancePhase(nowMs?: number): boolean {
    if (this.physicalDriveEnded || this.phaseStartedAtMs == null || !this.advancement) {
      return false;
    }
    if (this.advancement.mode === 'WALL_CLOCK') {
      const at = nowMs ?? this.lastTickMs ?? this.phaseStartedAtMs;
      const elapsed = at - this.phaseStartedAtMs;
      if (elapsed < this.advancement.targetWallDurationMs) {
        return false;
      }
      const graceBudget = this.advancement.graceBudgetMs ?? 0;
      const graceRemaining = Math.max(0, graceBudget - this.graceConsumedMs);
      if (elapsed <= this.advancement.targetWallDurationMs + graceRemaining) {
        return true;
      }
      return elapsed >= this.advancement.targetWallDurationMs;
    }
    return this.isPhaseSatisfied(nowMs);
  }

  sealActivePhaseAtBoundary(
    boundaryMs: number,
    reason: 'ADVANCE' | 'DRIVE_END',
  ): PhaseValidityRecord | null {
    if (this.phaseStartedAtMs == null || this.currentPhasePollMs == null) {
      return null;
    }
    if (this.lastTickMs != null && boundaryMs > this.lastTickMs) {
      // Unobserved tail after last real poll is uncertain — never fabricate MOVING boundaries.
      this.uncertainMovementDurationMs += Math.max(0, boundaryMs - this.lastTickMs);
    }
    const advancement = this.advancement;
    const effectiveBoundaryMs = Math.max(this.phaseStartedAtMs, boundaryMs);
    const wallDurationMs = effectiveBoundaryMs - this.phaseStartedAtMs;
    let satisfied = false;
    let scientificallyValid = false;
    if (advancement?.mode === 'WALL_CLOCK') {
      satisfied = wallDurationMs >= advancement.targetWallDurationMs;
      const minMovementMs = Math.min(wallDurationMs * 0.25, advancement.targetWallDurationMs * 0.25);
      scientificallyValid =
        satisfied && this.movementAccumulatedMs >= minMovementMs && this.movementAccumulatedMs > 0;
      if (wallDurationMs > advancement.targetWallDurationMs) {
        this.graceConsumedMs += wallDurationMs - advancement.targetWallDurationMs;
      }
    } else {
      const required = advancement?.requiredMovementMs ?? 0;
      satisfied = this.movementAccumulatedMs >= required;
      scientificallyValid =
        satisfied && this.movementAccumulatedMs > 0 && (reason === 'ADVANCE' || satisfied);
    }
    const motionCoveragePercent =
      wallDurationMs > 0
        ? Math.min(100, Math.round((this.movementAccumulatedMs / wallDurationMs) * 100))
        : 0;
    const record: PhaseValidityRecord = {
      phasePollIntervalMs: this.currentPhasePollMs,
      phaseStartedAtMs: this.phaseStartedAtMs,
      phaseEndedAtMs: effectiveBoundaryMs,
      wallDurationMs,
      validMovementDurationMs: this.movementAccumulatedMs,
      uncertainMovementDurationMs: this.uncertainMovementDurationMs,
      motionCoveragePercent,
      scientificallyValid,
      phaseCompletion: satisfied ? 'SATISFIED' : 'INCOMPLETE',
      advancementMode: advancement?.mode ?? 'MOVING_ACCUMULATION',
      targetWallDurationMs:
        advancement?.mode === 'WALL_CLOCK' ? advancement.targetWallDurationMs : null,
      requiredMovementMs:
        advancement?.mode === 'MOVING_ACCUMULATION' ? advancement.requiredMovementMs : null,
    };
    this.completed.push(record);
    this.currentPhasePollMs = null;
    this.phaseStartedAtMs = null;
    this.advancement = null;
    this.movementAccumulatedMs = 0;
    this.uncertainMovementDurationMs = 0;
    this.lastTickMs = null;
    this.lastMotionState = null;
    return record;
  }

  advancePhaseAtEffectiveBoundary(
    effectiveBoundaryMs: number,
    nextPollMs: number,
    nextAdvancement: PhaseAdvancementConfig,
  ): PhaseValidityRecord | null {
    const record = this.sealActivePhaseAtBoundary(effectiveBoundaryMs, 'ADVANCE');
    this.beginPhase(nextPollMs, effectiveBoundaryMs, nextAdvancement);
    return record;
  }

  /** @deprecated Use advancePhaseAtEffectiveBoundary with PhaseAdvancementConfig. */
  advancePhaseAtEffectiveBoundaryWithMovement(
    effectiveBoundaryMs: number,
    nextPollMs: number,
    requiredMovementMs: number,
  ): PhaseValidityRecord | null {
    return this.advancePhaseAtEffectiveBoundary(effectiveBoundaryMs, nextPollMs, {
      mode: 'MOVING_ACCUMULATION',
      requiredMovementMs,
    });
  }

  markPhysicalDriveEnded(nowMs: number): PhaseValidityRecord | null {
    this.physicalDriveEnded = true;
    return this.sealActivePhaseAtBoundary(nowMs, 'DRIVE_END');
  }

  getActivePhaseStartedAtMs(): number | null {
    return this.phaseStartedAtMs;
  }

  getCompletedPhases(): PhaseValidityRecord[] {
    return [...this.completed];
  }

  computeRunCompleteness(expectedPhaseCount: number): 'FULL' | 'PARTIAL' {
    const validCount = this.completed.filter((p) => p.scientificallyValid).length;
    return validCount >= expectedPhaseCount ? 'FULL' : 'PARTIAL';
  }
}

export function buildPhysicalDriveIntervalProbeId(ageMs: number): string {
  return `PDI-${ageMs / 1000}`;
}

export const EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL = 'PHYSICAL_DRIVE_INTERVAL_SHADOW';

export type PdiCandidateOverlayStatus =
  | PhysicalEndCandidateStatus
  | 'INVALIDATED_END_CANDIDATE';

export type PdiCandidateOverlayRecord = {
  candidateId: string;
  candidateBoundaryAt: string;
  candidateStatus: PdiCandidateOverlayStatus;
  candidateDetectedAt?: string;
  confirmedAt?: string;
  confirmedReason?: string;
  invalidatedAt?: string;
  invalidatedReason?: string;
};

export type Exp021PhysicalDriveIntervalAuthority = {
  physicalStartAt: string;
  physicalEndAt: string;
  source: 'ORCHESTRATOR_CONFIRMED' | 'PDI_CANDIDATE' | 'SESSION_ENVELOPE_FALLBACK';
  candidateId?: string;
};

export const EXP021_PDI_CANDIDATES_METADATA_KEY = 'pdiCandidates';
export const EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY = 'physicalDriveInterval';

export function computePdiProspectiveAtCreation(args: {
  scheduleCreatedAt: Date;
  candidateBoundaryAt: Date;
  scheduledAgeMs: number;
}): boolean {
  return (
    args.scheduleCreatedAt.getTime() <=
    args.candidateBoundaryAt.getTime() + args.scheduledAgeMs
  );
}

export function computePdiExecutedOnTime(args: {
  requestStartedAt: Date;
  scheduledAt: Date;
}): boolean {
  return args.requestStartedAt.getTime() <= args.scheduledAt.getTime();
}

export type CanonicalTripBindingResult =
  | {
      binding: 'SINGLE_MATCH';
      trip: {
        id: string;
        startTime: Date;
        endTime: Date;
        overlapMs: number;
        physicalIntervalCoverage: number;
        startBoundaryDeltaMs: number;
        endBoundaryDeltaMs: number;
      };
    }
  | { binding: 'AMBIGUOUS_SPLIT'; candidates: Array<{ id: string; overlapMs: number }> }
  | { binding: 'NOT_FOUND' };

export function rankCanonicalVehicleTripCandidates(args: {
  trips: Array<{
    id: string;
    tripStatus: string;
    startTime: Date;
    endTime: Date | null;
  }>;
  physicalStartMs: number;
  physicalEndMs: number;
}): CanonicalTripBindingResult {
  const { physicalStartMs, physicalEndMs } = args;
  const physicalDurationMs = Math.max(1, physicalEndMs - physicalStartMs);

  const scored = args.trips
    .filter((t) => t.tripStatus === 'COMPLETED' && t.endTime)
    .map((trip) => {
      const tripStartMs = trip.startTime.getTime();
      const tripEndMs = trip.endTime!.getTime();
      const overlapStart = Math.max(tripStartMs, physicalStartMs);
      const overlapEnd = Math.min(tripEndMs, physicalEndMs);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      return {
        id: trip.id,
        startTime: trip.startTime,
        endTime: trip.endTime!,
        overlapMs,
        physicalIntervalCoverage: overlapMs / physicalDurationMs,
        startBoundaryDeltaMs: tripStartMs - physicalStartMs,
        endBoundaryDeltaMs: tripEndMs - physicalEndMs,
      };
    })
    .filter((row) => row.overlapMs > 0)
    .sort((a, b) => b.overlapMs - a.overlapMs);

  if (scored.length === 0) {
    return { binding: 'NOT_FOUND' };
  }

  const best = scored[0];
  const closeCompetitors = scored.filter(
    (row) => row.id !== best.id && row.overlapMs >= best.overlapMs * 0.85,
  );
  if (closeCompetitors.length > 0) {
    return {
      binding: 'AMBIGUOUS_SPLIT',
      candidates: scored.slice(0, 5).map((row) => ({ id: row.id, overlapMs: row.overlapMs })),
    };
  }

  return {
    binding: 'SINGLE_MATCH',
    trip: best,
  };
}

/** Prospective probe B geometry authority for EXP-021. */
export const EXP021_PROSPECTIVE_PROBE_B_GEOMETRY_AUTHORITY = 'NOMINAL_PHASE_START_OFFSET';

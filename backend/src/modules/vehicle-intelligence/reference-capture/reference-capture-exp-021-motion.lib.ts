/**
 * EXP-021 — motion authority, freshness, and physical-drive phase validity helpers.
 * Used by autonomous orchestrator and stationary certification.
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
};

export const EXP021_DEFAULT_PHYSICAL_START: PhysicalStartDetectorConfig = {
  movementSpeedKmh: 8,
  minDistinctFreshSamples: 4,
  minDistinctTimestamps: 3,
  maxSampleAgeMs: 120_000,
};

export class PhysicalStartDetector {
  private readonly seenTimestamps = new Set<string>();
  private qualifyingSamples = 0;

  constructor(private readonly config: PhysicalStartDetectorConfig) {}

  reset(): void {
    this.seenTimestamps.clear();
    this.qualifyingSamples = 0;
  }

  record(sample: SpeedSample, nowMs: number): void {
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
    this.seenTimestamps.add(sample.speedTimestamp);
    this.qualifyingSamples += 1;
  }

  isConfirmed(): boolean {
    return (
      this.qualifyingSamples >= this.config.minDistinctFreshSamples &&
      this.seenTimestamps.size >= this.config.minDistinctTimestamps
    );
  }

  getQualifyingSampleCount(): number {
    return this.qualifyingSamples;
  }
}

export type PhaseValidityRecord = {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndedAtMs: number | null;
  wallDurationMs: number;
  validMovementDurationMs: number;
  motionCoveragePercent: number;
  scientificallyValid: boolean;
};

export class PhysicalDrivePhaseTracker {
  private currentPhasePollMs: number | null = null;
  private phaseStartedAtMs: number | null = null;
  private movementAccumulatedMs = 0;
  private lastTickMs: number | null = null;
  private physicalDriveEnded = false;
  private readonly completed: PhaseValidityRecord[] = [];

  beginPhase(pollMs: number, nowMs: number): void {
    this.currentPhasePollMs = pollMs;
    this.phaseStartedAtMs = nowMs;
    this.movementAccumulatedMs = 0;
    this.lastTickMs = nowMs;
  }

  markPhysicalDriveEnded(nowMs: number): void {
    this.physicalDriveEnded = true;
    this.flushActivePhase(nowMs);
  }

  tick(motionState: MotionState, nowMs: number): void {
    if (this.phaseStartedAtMs == null || this.physicalDriveEnded) {
      return;
    }
    if (this.lastTickMs != null && motionState === 'MOVING') {
      this.movementAccumulatedMs += Math.max(0, nowMs - this.lastTickMs);
    }
    this.lastTickMs = nowMs;
  }

  shouldAdvancePhase(requiredMovementMs: number): boolean {
    if (this.physicalDriveEnded || this.phaseStartedAtMs == null) {
      return false;
    }
    return this.movementAccumulatedMs >= requiredMovementMs;
  }

  advancePhase(nowMs: number, nextPollMs: number): PhaseValidityRecord | null {
    const record = this.flushActivePhase(nowMs);
    this.beginPhase(nextPollMs, nowMs);
    return record;
  }

  flushActivePhase(nowMs: number): PhaseValidityRecord | null {
    if (this.phaseStartedAtMs == null || this.currentPhasePollMs == null) {
      return null;
    }
    const wallDurationMs = nowMs - this.phaseStartedAtMs;
    const motionCoveragePercent =
      wallDurationMs > 0
        ? Math.min(100, Math.round((this.movementAccumulatedMs / wallDurationMs) * 100))
        : 0;
    const scientificallyValid = !this.physicalDriveEnded && this.movementAccumulatedMs > 0;
    const record: PhaseValidityRecord = {
      phasePollIntervalMs: this.currentPhasePollMs,
      phaseStartedAtMs: this.phaseStartedAtMs,
      phaseEndedAtMs: nowMs,
      wallDurationMs,
      validMovementDurationMs: this.movementAccumulatedMs,
      motionCoveragePercent,
      scientificallyValid,
    };
    this.completed.push(record);
    this.currentPhasePollMs = null;
    this.phaseStartedAtMs = null;
    this.movementAccumulatedMs = 0;
    this.lastTickMs = null;
    return record;
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

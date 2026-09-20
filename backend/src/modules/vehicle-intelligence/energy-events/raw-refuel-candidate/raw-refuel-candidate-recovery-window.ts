import type { RawRefuelCandidate } from '@prisma/client';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  type RawFuelRiseDetectorConfig,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

/** Hard cap — recovery must never reuse warm/cold trip scan windows. */
export const RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS = 3 * 60 * 60 * 1000;

export interface RawRefuelCandidateRecoveryWindow {
  start: Date;
  end: Date;
}

function collectCandidateEvidenceAnchors(candidate: RawRefuelCandidate): Date[] {
  return [
    candidate.physicalEvidenceStart,
    candidate.physicalEvidenceEnd,
    candidate.riseOnsetAt,
    candidate.riseEndAt,
  ].filter((value): value is Date => value instanceof Date);
}

function maxSampleGapMs(config: RawFuelRiseDetectorConfig): number {
  return Math.max(config.absolute.maxSampleGapMs, config.relative.maxSampleGapMs);
}

/**
 * Deterministic historical recovery window anchored on persisted candidate evidence.
 * `serviceNow` is used only when no evidence timestamps exist (fail-safe bound).
 */
export function computeRawRefuelCandidateRecoveryWindow(
  candidate: RawRefuelCandidate,
  serviceNow: Date,
  config: RawFuelRiseDetectorConfig = RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
): RawRefuelCandidateRecoveryWindow {
  const anchors = collectCandidateEvidenceAnchors(candidate);
  const riseAnchor =
    candidate.riseOnsetAt ??
    candidate.riseEndAt ??
    candidate.physicalEvidenceStart ??
    candidate.physicalEvidenceEnd ??
    serviceNow;

  const maxGapMs = maxSampleGapMs(config);
  const preHorizonMs =
    config.absolute.prePlateauMinSamples * maxGapMs + maxGapMs;
  const postHorizonMs =
    config.riseMaxDurationMs +
    config.provisionalPostContinuationGraceMs +
    config.absolute.postPlateauMinPersistenceMs +
    config.absolute.postPlateauMinSamples * maxGapMs +
    maxGapMs;

  const earliestAnchor =
    anchors.length > 0
      ? new Date(Math.min(...anchors.map((value) => value.getTime())))
      : riseAnchor;
  const latestAnchor =
    anchors.length > 0
      ? new Date(Math.max(...anchors.map((value) => value.getTime())))
      : riseAnchor;

  const unboundedStart = new Date(
    Math.min(earliestAnchor.getTime(), riseAnchor.getTime()) - preHorizonMs,
  );
  const unboundedEnd = new Date(
    Math.max(latestAnchor.getTime(), riseAnchor.getTime() + postHorizonMs),
  );

  const centerMs = riseAnchor.getTime();
  const halfMax = RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS / 2;
  let startMs = unboundedStart.getTime();
  let endMs = unboundedEnd.getTime();

  if (endMs - startMs > RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS) {
    startMs = centerMs - halfMax;
    endMs = centerMs + halfMax;
    if (unboundedStart.getTime() < startMs) {
      startMs = unboundedStart.getTime();
      endMs = Math.min(
        unboundedEnd.getTime(),
        startMs + RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS,
      );
    }
    if (unboundedEnd.getTime() > endMs) {
      endMs = unboundedEnd.getTime();
      startMs = Math.max(
        unboundedStart.getTime(),
        endMs - RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS,
      );
    }
  }

  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
}

export const RAW_REFUEL_CANDIDATE_RECOVERY_WINDOW_FORMULA =
  'start=min(earliestEvidence,riseAnchor)-preHorizonMs; end=max(latestEvidence,riseAnchor+postHorizonMs); preHorizon=prePlateauMinSamples*maxSampleGap+maxSampleGap; postHorizon=riseMaxDuration+provisionalPostGrace+postPlateauMinPersistence+postPlateauMinSamples*maxSampleGap+maxSampleGap; capped at RAW_REFUEL_CANDIDATE_RECOVERY_MAX_WINDOW_MS centered on rise when exceeded';

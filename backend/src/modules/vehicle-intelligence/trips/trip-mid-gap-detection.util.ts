/**
 * Mid-trip gap detection from DIMO core batches + detection-state anchor.
 *
 * P1B.9C: optional telemetry-silence hardening — synthetic speed=0 anchor and
 * engine-idle (speed=0, ignition on) must not prove a mid-gap trip boundary.
 */

import { shouldSplitQualifiedStop } from './trip-qualified-stop-duration.policy';

export type MidGapCorePoint = {
  timestamp: string;
  speed?: number | null;
  isIgnitionOn?: boolean | null;
};

export type MidGapTimelinePoint = {
  ts: Date;
  speed: number | null;
  ign: boolean | null;
  /** Injected from lastMeaningfulMovementAt — not a provider speed sample. */
  syntheticAnchor: boolean;
};

export type MidGapCandidate = {
  gapMs: number;
  firstEndAt: Date;
  firstEndLatitude: number | null;
  firstEndLongitude: number | null;
  secondStartAt: Date;
  secondStartLatitude: number | null;
  secondStartLongitude: number | null;
  /** Index of the post-gap sample in the built timeline (forensics/tests). */
  gapAfterIndex: number;
};

export type FindMidTripGapParams = {
  corePoints: MidGapCorePoint[];
  anchorAt: Date | null;
  maxSameTripQualifiedStopMs: number;
  stoppedSpeedKmh: number;
  telemetrySilenceHardeningEnabled: boolean;
};

const DEFAULT_STOPPED_SPEED_KMH = 5;
const DEFAULT_MOVING_SPEED_KMH = 5;

export function buildMidGapCoreTimeline(
  corePoints: MidGapCorePoint[],
  anchorAt: Date | null,
): MidGapTimelinePoint[] {
  const sorted = [...corePoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const timeline: MidGapTimelinePoint[] = [];
  if (anchorAt) {
    timeline.push({
      ts: anchorAt,
      speed: 0,
      ign: null,
      syntheticAnchor: true,
    });
  }
  for (const p of sorted) {
    timeline.push({
      ts: new Date(p.timestamp),
      speed: p.speed ?? null,
      ign: p.isIgnitionOn ?? null,
      syntheticAnchor: false,
    });
  }
  return timeline;
}

function isBeforeSampleStopped(
  before: MidGapTimelinePoint,
  stoppedSpeedKmh: number,
  telemetrySilenceHardeningEnabled: boolean,
): boolean {
  if (telemetrySilenceHardeningEnabled) {
    if (before.syntheticAnchor) {
      return false;
    }
    if (before.speed == null) {
      return false;
    }
    if (before.speed > stoppedSpeedKmh) {
      return false;
    }
    // Engine idle at speed=0 is not a witnessed trip-end boundary.
    if (before.ign === true) {
      return false;
    }
    return before.speed <= stoppedSpeedKmh;
  }
  return before.speed == null || before.speed <= stoppedSpeedKmh;
}

/**
 * Returns the largest qualifying mid-trip gap, or null.
 */
export function findMidTripGapCandidate(
  params: FindMidTripGapParams,
): MidGapCandidate | null {
  const {
    corePoints,
    anchorAt,
    maxSameTripQualifiedStopMs,
    stoppedSpeedKmh = DEFAULT_STOPPED_SPEED_KMH,
    telemetrySilenceHardeningEnabled,
  } = params;

  if (corePoints.length === 0 && !anchorAt) {
    return null;
  }

  const timeline = buildMidGapCoreTimeline(corePoints, anchorAt);
  if (timeline.length < 2) {
    return null;
  }

  const movingKmh = stoppedSpeedKmh;

  let bestIdx = -1;
  let bestGapMs = 0;
  for (let i = 1; i < timeline.length; i++) {
    const before = timeline[i - 1]!;
    const after = timeline[i]!;
    const gapMs = after.ts.getTime() - before.ts.getTime();
    if (!shouldSplitQualifiedStop(gapMs, maxSameTripQualifiedStopMs)) {
      continue;
    }
    if (
      !isBeforeSampleStopped(
        before,
        stoppedSpeedKmh,
        telemetrySilenceHardeningEnabled,
      )
    ) {
      continue;
    }
    if (gapMs > bestGapMs) {
      bestIdx = i;
      bestGapMs = gapMs;
    }
  }

  if (bestIdx < 0) {
    return null;
  }

  const after = timeline[bestIdx]!;
  const afterMoving = after.speed != null && after.speed > movingKmh;
  const anyLaterMoving = timeline
    .slice(bestIdx)
    .some((p) => p.speed != null && p.speed > movingKmh);
  if (!afterMoving && !anyLaterMoving) {
    return null;
  }

  let secondStartIdx = bestIdx;
  if (!afterMoving) {
    for (let i = bestIdx + 1; i < timeline.length; i++) {
      const p = timeline[i]!;
      if (p.speed != null && p.speed > movingKmh) {
        secondStartIdx = i;
        break;
      }
    }
  }

  const before = timeline[bestIdx - 1]!;
  const second = timeline[secondStartIdx]!;

  return {
    gapMs: bestGapMs,
    firstEndAt: before.ts,
    firstEndLatitude: null,
    firstEndLongitude: null,
    secondStartAt: second.ts,
    secondStartLatitude: null,
    secondStartLongitude: null,
    gapAfterIndex: bestIdx,
  };
}

export type TelemetrySilenceSuppressReason =
  | 'synthetic_anchor_only_stop'
  | 'no_witnessed_stop_in_gap_prefix';

/**
 * Additional guard when hardening is enabled: reject candidates whose only
 * pre-gap "stop" evidence is the synthetic anchor (P1B.9B Tiguan class).
 */
export function getMidGapTelemetrySilenceSuppressReason(
  timeline: MidGapTimelinePoint[],
  candidate: MidGapCandidate,
  stoppedSpeedKmh = DEFAULT_STOPPED_SPEED_KMH,
): TelemetrySilenceSuppressReason | null {
  const before = timeline[candidate.gapAfterIndex - 1];
  if (!before?.syntheticAnchor) {
    return null;
  }
  const witnessedStop = timeline
    .slice(0, candidate.gapAfterIndex)
    .some(
      (p) =>
        !p.syntheticAnchor &&
        p.speed != null &&
        p.speed <= stoppedSpeedKmh &&
        p.ign !== true,
    );
  if (!witnessedStop) {
    return 'synthetic_anchor_only_stop';
  }
  return null;
}

export function findMidTripGapCandidateWithPolicy(
  params: FindMidTripGapParams,
): MidGapCandidate | null {
  const candidate = findMidTripGapCandidate(params);
  if (!candidate || !params.telemetrySilenceHardeningEnabled) {
    return candidate;
  }
  const timeline = buildMidGapCoreTimeline(params.corePoints, params.anchorAt);
  const suppress = getMidGapTelemetrySilenceSuppressReason(
    timeline,
    candidate,
    params.stoppedSpeedKmh,
  );
  return suppress ? null : candidate;
}

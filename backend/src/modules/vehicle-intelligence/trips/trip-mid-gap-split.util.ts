import {
  classifyQualifiedStopDurationPolicy,
  shouldSplitQualifiedStop,
} from './trip-qualified-stop-duration.policy';

export type MidGapDriftState = 'WITHIN_THRESHOLD' | 'EXCEEDS_THRESHOLD' | 'UNKNOWN';

export type MidGapSplitCommitPhase = 'PRE_COMMIT' | 'POST_COMMIT';

export type MidGapPositionSample = {
  latitude: number;
  longitude: number;
};

export type MidGapDriftEvidence = {
  state: MidGapDriftState;
  driftM: number | null;
  missingPreWaypoint: boolean;
  missingPostWaypoint: boolean;
};

export type MidGapDriftDecision = {
  decision: 'ALLOW_SPLIT' | 'REJECTED';
  reason?: 'unknown_drift' | 'excessive_drift';
  evidence: MidGapDriftEvidence;
};

export type HaversineMetersFn = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => number;

export function computeMidGapDriftEvidence(params: {
  pre: MidGapPositionSample | null;
  post: MidGapPositionSample | null;
  maxAllowedDriftM: number;
  haversineMeters: HaversineMetersFn;
}): MidGapDriftEvidence {
  if (!params.pre) {
    return {
      state: 'UNKNOWN',
      driftM: null,
      missingPreWaypoint: true,
      missingPostWaypoint: params.post == null,
    };
  }
  if (!params.post) {
    return {
      state: 'UNKNOWN',
      driftM: null,
      missingPreWaypoint: false,
      missingPostWaypoint: true,
    };
  }

  const driftM = params.haversineMeters(
    params.pre.latitude,
    params.pre.longitude,
    params.post.latitude,
    params.post.longitude,
  );

  if (!Number.isFinite(driftM)) {
    return {
      state: 'UNKNOWN',
      driftM: null,
      missingPreWaypoint: false,
      missingPostWaypoint: false,
    };
  }

  if (driftM > params.maxAllowedDriftM) {
    return {
      state: 'EXCEEDS_THRESHOLD',
      driftM,
      missingPreWaypoint: false,
      missingPostWaypoint: false,
    };
  }

  return {
    state: 'WITHIN_THRESHOLD',
    driftM,
    missingPreWaypoint: false,
    missingPostWaypoint: false,
  };
}

export function classifyLiveMidGapDriftDecision(
  evidence: MidGapDriftEvidence,
  maxAllowedDriftM: number,
): MidGapDriftDecision {
  if (evidence.state === 'UNKNOWN') {
    return { decision: 'REJECTED', reason: 'unknown_drift', evidence };
  }
  if (evidence.state === 'EXCEEDS_THRESHOLD') {
    return { decision: 'REJECTED', reason: 'excessive_drift', evidence };
  }
  if (evidence.driftM == null || evidence.driftM > maxAllowedDriftM) {
    return { decision: 'REJECTED', reason: 'excessive_drift', evidence };
  }
  return { decision: 'ALLOW_SPLIT', evidence };
}

export function buildMidGapRejectedForensics(params: {
  gapMs: number;
  firstEndAt: Date;
  secondStartAt: Date;
  driftDecision: MidGapDriftDecision;
  maxAllowedDriftM: number;
}): Record<string, unknown> {
  return {
    decision: 'REJECTED',
    reason: params.driftDecision.reason,
    gapMs: params.gapMs,
    firstEndAt: params.firstEndAt.toISOString(),
    secondStartAt: params.secondStartAt.toISOString(),
    driftState: params.driftDecision.evidence.state,
    driftM: params.driftDecision.evidence.driftM,
    maxAllowedDriftM: params.maxAllowedDriftM,
    missingPreWaypoint: params.driftDecision.evidence.missingPreWaypoint,
    missingPostWaypoint: params.driftDecision.evidence.missingPostWaypoint,
  };
}

export function buildMidGapAppliedForensics(params: {
  gapMs: number;
  firstEndAt: Date;
  secondStartAt: Date;
  driftM: number | null;
  firstTripId: string;
  secondTripId: string;
  maxSameTripStopMs?: number;
  qualificationReason?: string;
}): Record<string, unknown> {
  return {
    decision: 'APPLIED',
    triggeredBy: 'LIVE_FSM',
    gapMs: params.gapMs,
    firstEndAt: params.firstEndAt.toISOString(),
    secondStartAt: params.secondStartAt.toISOString(),
    driftM: params.driftM,
    firstTripId: params.firstTripId,
    secondTripId: params.secondTripId,
    ...(params.maxSameTripStopMs != null
      ? {
          maxSameTripStopMs: params.maxSameTripStopMs,
          durationPolicyDecision: classifyQualifiedStopDurationPolicy(
            params.gapMs,
            params.maxSameTripStopMs,
          ),
          durationComparator: 'LTE_SAME_GT_SPLIT',
        }
      : {}),
    ...(params.qualificationReason
      ? { qualificationReason: params.qualificationReason }
      : {}),
  };
}

export type CoreTimelineGapPoint = {
  ts: Date;
  speed: number | null;
};

/**
 * Live FSM mid-gap candidate selection (duration + stationary-before + resumed-motion).
 * Physical drift / pre-duration gates are applied by the orchestrator after this.
 */
export function findLargestQualifyingMidGapFromCoreTimeline(params: {
  timeline: CoreTimelineGapPoint[];
  maxSameTripQualifiedStopMs: number;
  speedStoppedKmh?: number;
  speedMovingKmh?: number;
}): {
  gapMs: number;
  firstEndAt: Date;
  secondStartAt: Date;
} | null {
  const stoppedKmh = params.speedStoppedKmh ?? 5;
  const movingKmh = params.speedMovingKmh ?? 5;
  const timeline = params.timeline;
  if (timeline.length < 2) return null;

  let bestIdx = -1;
  let bestGapMs = 0;
  for (let i = 1; i < timeline.length; i++) {
    const before = timeline[i - 1]!;
    const after = timeline[i]!;
    const gapMs = after.ts.getTime() - before.ts.getTime();
    if (!shouldSplitQualifiedStop(gapMs, params.maxSameTripQualifiedStopMs)) {
      continue;
    }
    const beforeStopped = before.speed == null || before.speed <= stoppedKmh;
    if (!beforeStopped) continue;
    if (gapMs > bestGapMs) {
      bestIdx = i;
      bestGapMs = gapMs;
    }
  }

  if (bestIdx < 0) return null;

  const after = timeline[bestIdx]!;
  const afterMoving = after.speed != null && after.speed > movingKmh;
  const anyLaterMoving = timeline
    .slice(bestIdx)
    .some((p) => p.speed != null && p.speed > movingKmh);
  if (!afterMoving && !anyLaterMoving) return null;

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
    secondStartAt: second.ts,
  };
}

export function selectRoutePointAtOrBefore<T extends { timestamp: string | Date }>(
  points: T[],
  boundary: Date,
): T | null {
  let best: T | null = null;
  let bestMs = -Infinity;
  const boundaryMs = boundary.getTime();
  for (const point of points) {
    const tsMs = new Date(point.timestamp).getTime();
    if (tsMs <= boundaryMs && tsMs > bestMs) {
      best = point;
      bestMs = tsMs;
    }
  }
  return best;
}

export function selectRoutePointAtOrAfter<T extends { timestamp: string | Date }>(
  points: T[],
  boundary: Date,
): T | null {
  let best: T | null = null;
  let bestMs = Infinity;
  const boundaryMs = boundary.getTime();
  for (const point of points) {
    const tsMs = new Date(point.timestamp).getTime();
    if (tsMs >= boundaryMs && tsMs < bestMs) {
      best = point;
      bestMs = tsMs;
    }
  }
  return best;
}

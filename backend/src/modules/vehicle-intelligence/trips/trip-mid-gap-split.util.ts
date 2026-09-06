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

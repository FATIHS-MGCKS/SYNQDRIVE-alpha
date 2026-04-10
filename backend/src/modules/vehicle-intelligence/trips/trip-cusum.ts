/**
 * CUSUM (Cumulative Sum Control Chart) based change point detection
 * for SynqDrive V2 Trip End validation.
 *
 * Used ONLY as a targeted end-validation mechanism after a trip enters
 * POSSIBLE_END and the stability window has elapsed.  NOT used for live
 * trip start detection or continuous polling.
 *
 * Algorithm overview:
 *   Given a time-series of speed values, we want to detect where the
 *   signal permanently transitioned from ACTIVE (speed > threshold) to
 *   INACTIVE (speed ≈ 0).  CUSUM detects this as an upward shift in the
 *   cumulative "stopped-ness" of the signal.
 *
 *   1. Compute a binary "stopped" indicator per sample (1 = stopped, 0 = moving)
 *   2. Run upper-CUSUM over this indicator with target mean = 0.3 (30 % stopped
 *      is still considered "active"), slack k = 0.2
 *   3. When the CUSUM sum S exceeds the threshold H, a change point is detected
 *   4. Back-track to find the exact index where the sum started accumulating
 *      (the actual transition point)
 */

import type { TripCoreDataPoint } from '../../dimo/dimo-segments.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CusumResult {
  /** Whether a clear end change-point was detected in the data */
  changePointDetected: boolean;
  /** Timestamp of the detected transition from active → stopped */
  changePointAt: Date | null;
  /** Timestamp of the last data point with meaningful movement */
  lastMovementAt: Date | null;
  /** Whether the signal appears to still be ongoing / active at end of window */
  appearsOngoing: boolean;
  /** Confidence in the result */
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Human-readable reason */
  reason: string;
  /** Points analysed */
  analyzedPoints: number;
}

export interface CusumOptions {
  /** Speed below this (km/h) counts as "stopped" */
  stoppedThresholdKmh?: number;
  /** CUSUM target mean: expected fraction of stopped samples in active trip */
  targetActiveMean?: number;
  /** CUSUM slack parameter k (allowance) */
  slackK?: number;
  /** CUSUM decision threshold H */
  decisionThresholdH?: number;
  /** Minimum number of consecutive stopped points after change-point to confirm end */
  minConfirmationPoints?: number;
  /** Minimum fraction of post-change-point window that must be stopped */
  minConfirmationFraction?: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_OPTS: Required<CusumOptions> = {
  stoppedThresholdKmh: 2,
  targetActiveMean: 0.3,
  slackK: 0.2,
  decisionThresholdH: 3.0,
  minConfirmationPoints: 3,
  minConfirmationFraction: 0.75,
};

// ─── Core CUSUM detector ─────────────────────────────────────────────────────

/**
 * Run CUSUM change-point detection over a sorted array of TripCoreDataPoints.
 *
 * Returns a CusumResult describing whether a clear active→stopped transition
 * was found, and if so, the best estimate of when it occurred.
 */
export function detectTripEndChangePoint(
  points: TripCoreDataPoint[],
  opts: CusumOptions = {},
): CusumResult {
  const o = { ...DEFAULT_OPTS, ...opts };
  const n = points.length;

  if (n < 4) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt: null,
      appearsOngoing: n < 2,
      confidence: 'LOW',
      reason: 'insufficient_data',
      analyzedPoints: n,
    };
  }

  // ── 1. Build binary stopped-indicator and timestamps ──
  const stopped: boolean[] = points.map(
    (p) => p.speed == null || p.speed <= o.stoppedThresholdKmh,
  );
  const timestamps: number[] = points.map((p) => new Date(p.timestamp).getTime());

  // ── 2. Check if data ends with ongoing movement ──
  const lastFiveActive = stopped.slice(-5).filter((s) => !s).length >= 3;
  if (lastFiveActive) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt: new Date(timestamps[n - 1]),
      appearsOngoing: true,
      confidence: 'MEDIUM',
      reason: 'still_active_at_window_end',
      analyzedPoints: n,
    };
  }

  // ── 3. Find last meaningful movement point ──
  let lastMovementIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (!stopped[i]) {
      lastMovementIdx = i;
      break;
    }
  }

  const lastMovementAt =
    lastMovementIdx >= 0 ? new Date(timestamps[lastMovementIdx]) : null;

  // If the signal was already all-stopped from the beginning, likely no valid end here
  if (lastMovementIdx < 0) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt: null,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'all_stopped_from_start',
      analyzedPoints: n,
    };
  }

  // ── 4. Run upper-CUSUM over stopped[] ──
  // S[i] = max(0, S[i-1] + (stopped[i] ? 1 : 0) - target - k)
  // When S >= H, a change-point was detected.
  const S: number[] = new Array(n).fill(0);
  let changePointIdx = -1;

  for (let i = 1; i < n; i++) {
    const x = stopped[i] ? 1 : 0;
    S[i] = Math.max(0, S[i - 1] + x - o.targetActiveMean - o.slackK);
    if (S[i] >= o.decisionThresholdH && changePointIdx < 0) {
      changePointIdx = i;
    }
  }

  if (changePointIdx < 0) {
    // CUSUM threshold not crossed — no clear change point
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'cusum_threshold_not_crossed',
      analyzedPoints: n,
    };
  }

  // ── 5. Back-track from changePointIdx to find where S began accumulating ──
  // Walk backward from the detection point to the start of the run
  let transitionIdx = changePointIdx;
  for (let i = changePointIdx; i >= 1; i--) {
    if (S[i - 1] === 0) {
      transitionIdx = i;
      break;
    }
  }

  // Align the transition to the lastMovementIdx + 1 (first confirmed stopped point)
  const estimatedEndIdx = Math.max(transitionIdx, lastMovementIdx + 1);

  // ── 6. Confirm: check that most of [estimatedEndIdx..n-1] is stopped ──
  const postChangePoints = stopped.slice(estimatedEndIdx);
  const stoppedFraction =
    postChangePoints.filter((s) => s).length / Math.max(postChangePoints.length, 1);

  if (
    postChangePoints.length < o.minConfirmationPoints ||
    stoppedFraction < o.minConfirmationFraction
  ) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'insufficient_confirmation_after_change_point',
      analyzedPoints: n,
    };
  }

  const confidence: CusumResult['confidence'] =
    stoppedFraction >= 0.95 ? 'HIGH' : stoppedFraction >= 0.80 ? 'MEDIUM' : 'LOW';

  return {
    changePointDetected: true,
    changePointAt: new Date(timestamps[estimatedEndIdx]),
    lastMovementAt,
    appearsOngoing: false,
    confidence,
    reason: `cusum_change_point_confirmed stoppedFraction=${Math.round(stoppedFraction * 100)}%`,
    analyzedPoints: n,
  };
}

/**
 * Assess whether data around a POSSIBLE_END candidate has any sign of ongoing
 * activity — used to decide whether to revert to ACTIVE_TRIP.
 */
export function hasOngoingActivityInWindow(
  points: TripCoreDataPoint[],
  stoppedThresholdKmh = 3,
  odometerMinDeltaKm = 0.05,
): boolean {
  if (points.length === 0) return false;

  // Any speed above threshold → ongoing
  if (points.some((p) => p.speed != null && p.speed > stoppedThresholdKmh)) {
    return true;
  }

  // Odometer progress → ongoing
  const odo = points.filter((p) => p.travelledDistance != null).map((p) => p.travelledDistance!);
  if (odo.length >= 2) {
    const delta = odo[odo.length - 1] - odo[0];
    if (delta > odometerMinDeltaKm) return true;
  }

  return false;
}

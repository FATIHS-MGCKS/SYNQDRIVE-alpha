import { registerAs } from '@nestjs/config';

export default registerAs('worker', () => ({
  snapshotIntervalMs: parseInt(process.env.WORKER_SNAPSHOT_INTERVAL_MS || '30000', 10),
  tripTrackingIntervalMs: parseInt(process.env.WORKER_TRIP_TRACKING_INTERVAL_MS || '30000', 10),
  tripTrackingConcurrency: parseInt(process.env.WORKER_TRIP_TRACKING_CONCURRENCY || '5', 10),

  // ── Trip Active Continuity: time-based evaluation windows ──
  // How far back from "now" to look at core data when evaluating active/idle/end.
  // Replaces the old hardcoded slice(-5) approach.
  tripContinuityCoreWindowMs: parseInt(process.env.TRIP_CONTINUITY_CORE_WINDOW_MS || '120000', 10),
  // How far back from "now" to look at performance data for ICE engine activity.
  tripContinuityPerfWindowMs: parseInt(process.env.TRIP_CONTINUITY_PERF_WINDOW_MS || '90000', 10),

  // ── Trip End: Timeout fallback (last resort, not primary end trigger) ──
  // How long to wait in POSSIBLE_END before hard-forcing finalization.
  tripEndTimeoutMs: parseInt(process.env.WORKER_TRIP_END_TIMEOUT_MS || '1800000', 10),

  // ── Trip End: Stability window before triggering CUSUM validation ──
  // Trip must remain in POSSIBLE_END for this duration before CUSUM runs.
  tripEndStabilityWindowMs: parseInt(process.env.TRIP_END_STABILITY_WINDOW_MS || '90000', 10),

  // ── Trip End: Min inactivity before CUSUM is triggered ──
  // Enforced as a guard in POSSIBLE_END_CHECK before scheduling END_VALIDATION.
  // CUSUM gate = max(stabilityWindow, minInactivity). Defaults: 90s stability,
  // 120s min inactivity → 120s gate before first CUSUM attempt.
  tripEndMinInactivityBeforeCusumMs: parseInt(
    process.env.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS || '120000',
    10,
  ),

  // ── Trip End: Retry interval between CUSUM validation attempts ──
  tripEndValidationRetryMs: parseInt(process.env.TRIP_END_VALIDATION_RETRY_MS || '60000', 10),

  // ── Trip End: Max CUSUM validation attempts before accepting timeout fallback ──
  tripEndValidationMaxAttempts: parseInt(process.env.TRIP_END_VALIDATION_MAX_ATTEMPTS || '3', 10),

  // ── Trip End: How far back from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookbackMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKBACK_MS || '900000', 10),

  // ── Trip End: How far forward from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookaheadMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKAHEAD_MS || '300000', 10),

  // ── Trip Mid-Gap Split ──
  // Minimum stationary silence inside an otherwise ACTIVE trip that triggers
  // an automatic split into two trips. Covers the common case of a driver
  // parking briefly (coffee run, pickup, short errand) with the engine off:
  // DIMO then drops the connection, resumes on restart, and neither side
  // emits an explicit ignition-off transition. Default 3 min.
  tripMidGapSplitMs: parseInt(process.env.TRIP_MID_GAP_SPLIT_MS || '180000', 10),
  // Maximum position drift (meters) between the last pre-gap waypoint and
  // the first post-gap waypoint for the gap to be considered a stationary
  // stop (i.e., the same parking spot). Larger drifts mean the vehicle kept
  // moving through a signal dropout (e.g., tunnel) and MUST NOT be split.
  tripMidGapMaxStationaryDriftM: parseInt(
    process.env.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M || '200',
    10,
  ),
  // Lower bound for the pre-split trip's existing duration/distance.
  // Prevents splitting a trip whose first segment would be trivially short
  // (e.g., false-positive signal glitches near trip start).
  tripMidGapMinPreDurationMs: parseInt(
    process.env.TRIP_MID_GAP_MIN_PRE_DURATION_MS || '60000',
    10,
  ),
}));

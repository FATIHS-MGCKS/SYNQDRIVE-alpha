import { registerAs } from '@nestjs/config';

export default registerAs('worker', () => ({
  snapshotIntervalMs: parseInt(process.env.WORKER_SNAPSHOT_INTERVAL_MS || '30000', 10),
  tripTrackingIntervalMs: parseInt(process.env.WORKER_TRIP_TRACKING_INTERVAL_MS || '60000', 10),
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
  tripEndStabilityWindowMs: parseInt(process.env.TRIP_END_STABILITY_WINDOW_MS || '180000', 10),

  // ── Trip End: Min inactivity before CUSUM is triggered ──
  // Must be <= stability window.  Enforced as a guard in POSSIBLE_END_CHECK before
  // scheduling END_VALIDATION.  Prevents premature CUSUM calls when inactivity is
  // very short.  Default equals the stability window so the two are equivalent unless
  // explicitly overridden.
  tripEndMinInactivityBeforeCusumMs: parseInt(
    process.env.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS || '180000',
    10,
  ),

  // ── Trip End: Retry interval between CUSUM validation attempts ──
  tripEndValidationRetryMs: parseInt(process.env.TRIP_END_VALIDATION_RETRY_MS || '120000', 10),

  // ── Trip End: Max CUSUM validation attempts before accepting timeout fallback ──
  tripEndValidationMaxAttempts: parseInt(process.env.TRIP_END_VALIDATION_MAX_ATTEMPTS || '3', 10),

  // ── Trip End: How far back from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookbackMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKBACK_MS || '900000', 10),

  // ── Trip End: How far forward from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookaheadMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKAHEAD_MS || '300000', 10),
}));

/** KS MX 2024 canary identity — design authority EXP-021 §8. */
export const EXP021_KS_MX_2024_CANARY = {
  organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
  tokenId: 187336,
} as const;

/** Bounded slack for DB admission + strata/slot creation + BullMQ enqueue before first planned age. */
export const EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS = 5_000;

/** Default poll interval for --wait-next-window (ms). */
export const EXP021_CANARY_WAIT_NEXT_WINDOW_POLL_MS = 2_000;

/** Maximum wait duration for --wait-next-window (ms) — operator must restart after timeout. */
export const EXP021_CANARY_WAIT_NEXT_WINDOW_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export const EXP021_CANARY_WINDOW_CLOSE_AUTHORITY =
  'REFERENCE_CAPTURE_PHYSICAL_DRIVE_INTERVAL.physicalEndAt';

export const EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY =
  'REFERENCE_CAPTURE_PHYSICAL_DRIVE_INTERVAL.physicalEndAt';

export const EXP021_CANARY_ACTIVITY_AUTHORITY =
  'INDEPENDENT_TELEMETRY.parseSpeedSampleFromSignalsLatest';

export const EXP021_CANARY_POLICY_DELAY_AUTHORITY =
  'HF_RECOVERY_POLICY_V2.resolvePolicyDelayProbeMs';

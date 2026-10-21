import type { HvChargingCounterAvailabilityV1 } from './hv-charging-counter-evidence.constants.v1';

export interface HvChargingCounterBucketInputV1 {
  bucketStartAt: Date;
  bucketEndAt: Date | null;
  valueKwh: number | null;
  minKwh: number | null;
  maxKwh: number | null;
  availability: HvChargingCounterAvailabilityV1;
}

export interface HvChargingCounterDimoIntervalRowV1 {
  timestamp: string;
  addedKwhLast: number | null;
  addedKwhMin?: number | null;
  addedKwhMax?: number | null;
}

import type { HvChargingCounterQualityAssessmentV2 } from './hv-charging-counter-evidence.counter-quality.v2';

export interface HvChargingCounterCaptureResultV1 {
  skipped: boolean;
  skipReason?:
    | 'disabled'
    | 'ongoing_session'
    | 'non_native_source'
    | 'unchanged_within_revalidation_window'
    | 'duplicate_batch'
    | 'rate_limited'
    | 'provider_error'
    | 'no_dimo_token'
    | 'provider_empty_intervals'
    | 'provider_invalid_response'
    | 'vehicle_not_allowlisted'
    | 'allowlist_invalid'
    | 'pilot_session_budget_exhausted'
    | 'pilot_session_not_admitted'
    | 'pilot_mode_invalid'
    | 'pilot_provider_budget_exhausted'
    | 'provider_request_guard_busy';
  batchId?: string;
  observationSetFingerprint?: string;
  bucketsWritten?: number;
  revisionsCreated?: number;
  counterQuality?: HvChargingCounterQualityAssessmentV2;
}

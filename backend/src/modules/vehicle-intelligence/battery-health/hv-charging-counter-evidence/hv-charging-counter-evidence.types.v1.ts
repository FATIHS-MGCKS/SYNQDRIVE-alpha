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

export interface HvChargingCounterCaptureResultV1 {
  skipped: boolean;
  skipReason?:
    | 'disabled'
    | 'ongoing_session'
    | 'non_native_source'
    | 'unchanged_session_identity'
    | 'duplicate_batch'
    | 'rate_limited'
    | 'provider_error'
    | 'no_dimo_token';
  batchId?: string;
  observationSetFingerprint?: string;
  bucketsWritten?: number;
  revisionsCreated?: number;
}

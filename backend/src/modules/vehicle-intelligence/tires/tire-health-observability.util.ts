/**
 * Structured tire-health logs — no PII (no vehicleId, VIN, tripId, orgId).
 */

export type TireHealthLogComponent =
  | 'tire_recalculation'
  | 'tire_trip_usage'
  | 'tire_odometer_anchor'
  | 'tire_measurement'
  | 'tire_prediction_validation'
  | 'tire_pressure_normalization'
  | 'tire_rental_block'
  | 'tire_alert'
  | 'tire_snapshot';

export type TireHealthLogStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'deduplicated'
  | 'duplicate_prevented'
  | 'mapping_conflict'
  | 'resolved'
  | 'created'
  | 'invalid'
  | 'stale';

export interface TireHealthLogEvent {
  component: TireHealthLogComponent;
  event: string;
  status: TireHealthLogStatus;
  durationMs?: number | null;
  /** Low-cardinality reason / skip / block code. */
  reasonCode?: string | null;
  result?: string | null;
  source?: string | null;
  displayMode?: string | null;
  alertType?: string | null;
  coverageBucket?: string | null;
  attempt?: number | null;
  errorCode?: string | null;
}

export function bucketPressureCoverageRatio(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio <= 0) return '0';
  if (ratio < 0.25) return 'lt_25';
  if (ratio < 0.5) return '25_49';
  if (ratio < 0.75) return '50_74';
  if (ratio < 1) return '75_99';
  return '100';
}

export function bucketPredictionErrorMm(errorMm: number | null | undefined): string {
  if (errorMm == null || !Number.isFinite(errorMm)) return 'unknown';
  const abs = Math.abs(errorMm);
  if (abs <= 0.2) return 'le_0_2';
  if (abs <= 0.5) return 'le_0_5';
  if (abs <= 1.0) return 'le_1_0';
  if (abs <= 2.0) return 'le_2_0';
  return 'gt_2_0';
}

export function formatTireHealthLog(event: TireHealthLogEvent): string {
  const payload: Record<string, unknown> = {
    component: event.component,
    event: event.event,
    status: event.status,
  };
  if (event.durationMs != null) payload.durationMs = event.durationMs;
  if (event.reasonCode) payload.reasonCode = event.reasonCode;
  if (event.result) payload.result = event.result;
  if (event.source) payload.source = event.source;
  if (event.displayMode) payload.displayMode = event.displayMode;
  if (event.alertType) payload.alertType = event.alertType;
  if (event.coverageBucket) payload.coverageBucket = event.coverageBucket;
  if (event.attempt != null) payload.attempt = event.attempt;
  if (event.errorCode) payload.errorCode = event.errorCode;
  return JSON.stringify(payload);
}

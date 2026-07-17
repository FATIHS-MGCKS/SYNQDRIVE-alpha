/**
 * Structured brake-health logs — no PII (no vehicleId, VIN, tripId, serviceEventId, orgId).
 */

export type BrakeHealthLogComponent =
  | 'brake_registration_initialization'
  | 'brake_component_installation'
  | 'brake_service_application'
  | 'brake_evidence'
  | 'brake_tdi_processing'
  | 'brake_dimo_intake'
  | 'brake_event_dedupe'
  | 'brake_recalculation'
  | 'brake_snapshot'
  | 'brake_alert'
  | 'brake_rental_block'
  | 'brake_backfill'
  | 'brake_reconciliation';

export type BrakeHealthLogStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'deduplicated'
  | 'duplicate_prevented'
  | 'resolved'
  | 'created'
  | 'conflict'
  | 'stale';

export interface BrakeHealthLogEvent {
  component: BrakeHealthLogComponent;
  event: string;
  status: BrakeHealthLogStatus;
  durationMs?: number | null;
  reasonCode?: string | null;
  result?: string | null;
  source?: string | null;
  trigger?: string | null;
  componentType?: string | null;
  alertType?: string | null;
  coverageBucket?: string | null;
  errorCode?: string | null;
  mode?: string | null;
}

export function bucketCoverageRatio(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio <= 0) return '0';
  if (ratio < 0.25) return 'lt_25';
  if (ratio < 0.5) return '25_49';
  if (ratio < 0.75) return '50_74';
  if (ratio < 1) return '75_99';
  return '100';
}

export function bucketNeutralGapKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km <= 0) return '0';
  if (km < 50) return 'lt_50';
  if (km < 200) return '50_199';
  if (km < 500) return '200_499';
  if (km < 1000) return '500_999';
  return 'gte_1000';
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

export function formatBrakeHealthLog(event: BrakeHealthLogEvent): string {
  const payload: Record<string, unknown> = {
    component: event.component,
    event: event.event,
    status: event.status,
  };
  if (event.durationMs != null) payload.durationMs = event.durationMs;
  if (event.reasonCode) payload.reasonCode = event.reasonCode;
  if (event.result) payload.result = event.result;
  if (event.source) payload.source = event.source;
  if (event.trigger) payload.trigger = event.trigger;
  if (event.componentType) payload.componentType = event.componentType;
  if (event.alertType) payload.alertType = event.alertType;
  if (event.coverageBucket) payload.coverageBucket = event.coverageBucket;
  if (event.errorCode) payload.errorCode = event.errorCode;
  if (event.mode) payload.mode = event.mode;
  return JSON.stringify(payload);
}

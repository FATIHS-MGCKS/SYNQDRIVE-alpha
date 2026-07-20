import { createHash } from 'crypto';
import { fingerprintBullMqJobIdKey } from '@shared/queue/bullmq-job-id.sanitizer';

export type BatteryV2PipelineComponent =
  | 'enqueue'
  | 'processor'
  | 'reconciliation'
  | 'publication';

export type BatteryV2PipelineLogStatus =
  | 'completed'
  | 'failed'
  | 'suppressed'
  | 'skipped';

export type BatteryV2EnqueueSuppressionReason =
  | 'dead_letter'
  | 'duplicate'
  | 'workers_disabled';

export interface BatteryV2PipelineLogEvent {
  component: BatteryV2PipelineComponent;
  event: string;
  status: BatteryV2PipelineLogStatus;
  jobType?: string;
  organizationId?: string;
  vehicleId?: string;
  keyFp?: string;
  jobIdFp?: string;
  correlationId?: string;
  errorCode?: string;
  suppressionReason?: BatteryV2EnqueueSuppressionReason | string;
  attempt?: number;
  maxAttempts?: number;
  reconciliation?: Record<string, number>;
  publicationMaturity?: string;
  publicationAgeBucket?: string;
}

export function fingerprintBatteryV2IdempotencyKey(key: string): string {
  return fingerprintBullMqJobIdKey(key);
}

export function fingerprintBatteryV2JobId(jobId: string): string {
  return createHash('sha256').update(jobId, 'utf8').digest('hex').slice(0, 12);
}

/** Low-cardinality publication-age buckets for metrics/logs (no per-vehicle labels). */
export function bucketPublicationAgeHours(ageHours: number | null | undefined): string {
  if (ageHours == null || !Number.isFinite(ageHours) || ageHours < 0) {
    return 'unknown';
  }
  if (ageHours < 1) return 'lt_1h';
  if (ageHours < 6) return '1_6h';
  if (ageHours < 24) return '6_24h';
  if (ageHours < 24 * 7) return '1_7d';
  return 'gt_7d';
}

export function computePublicationEvidenceAgeHours(
  firstEvidenceObservedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!firstEvidenceObservedAt) return null;
  const firstMs = new Date(firstEvidenceObservedAt).getTime();
  if (!Number.isFinite(firstMs)) return null;
  const ageHours = (now.getTime() - firstMs) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return null;
  return ageHours;
}

export function formatBatteryV2PipelineLog(event: BatteryV2PipelineLogEvent): string {
  const payload: Record<string, unknown> = {
    msg: `battery.v2.${event.component}.${event.event}`,
    component: event.component,
    event: event.event,
    status: event.status,
  };

  if (event.jobType) payload.jobType = event.jobType;
  if (event.organizationId) payload.organizationId = event.organizationId;
  if (event.vehicleId) payload.vehicleId = event.vehicleId;
  if (event.keyFp) payload.keyFp = event.keyFp;
  if (event.jobIdFp) payload.jobIdFp = event.jobIdFp;
  if (event.correlationId) payload.correlationId = event.correlationId;
  if (event.errorCode) payload.errorCode = event.errorCode;
  if (event.suppressionReason) payload.suppressionReason = event.suppressionReason;
  if (event.attempt != null) payload.attempt = event.attempt;
  if (event.maxAttempts != null) payload.maxAttempts = event.maxAttempts;
  if (event.reconciliation) payload.reconciliation = event.reconciliation;
  if (event.publicationMaturity) payload.publicationMaturity = event.publicationMaturity;
  if (event.publicationAgeBucket) payload.publicationAgeBucket = event.publicationAgeBucket;

  return JSON.stringify(payload);
}

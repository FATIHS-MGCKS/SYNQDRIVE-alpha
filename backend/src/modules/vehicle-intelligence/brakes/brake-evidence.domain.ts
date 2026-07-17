import {
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfirmationStatus,
  BrakeEvidenceFreshnessStatus,
  BrakeEvidenceSource,
  BrakeWheelPosition,
} from '@prisma/client';
import {
  aggregateBrakeCondition,
  classifyDiscConditionLabel,
  classifyDtcSeverity,
  classifyFluidStatus,
  type BrakeCondition,
} from './brake-status';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

const cfg = BRAKE_HEALTH_CONFIG.evidenceLifecycle;

/** Sources that may persist real measured pad/disc mm as ground truth. */
export const MM_GROUND_TRUTH_SOURCES: ReadonlySet<BrakeEvidenceSource> = new Set([
  BrakeEvidenceSource.MANUAL_MEASUREMENT,
  BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
  BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
  BrakeEvidenceSource.DOCUMENTED_REPLACEMENT,
  BrakeEvidenceSource.INSPECTION_PROTOCOL,
  BrakeEvidenceSource.BRAKE_WEAR_SENSOR,
]);

const MEASUREMENT_SOURCES: ReadonlySet<BrakeEvidenceSource> = new Set([
  BrakeEvidenceSource.MANUAL_MEASUREMENT,
  BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
  BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
  BrakeEvidenceSource.INSPECTION_PROTOCOL,
  BrakeEvidenceSource.BRAKE_WEAR_SENSOR,
]);

const ESTIMATION_SOURCES: ReadonlySet<BrakeEvidenceSource> = new Set([
  BrakeEvidenceSource.TELEMATICS_ESTIMATION,
]);

const SAFETY_SIGNAL_SOURCES: ReadonlySet<BrakeEvidenceSource> = new Set([
  BrakeEvidenceSource.DTC_SIGNAL,
  BrakeEvidenceSource.PROVIDER_WARNING,
  BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
  BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
  BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
  BrakeEvidenceSource.MANUAL_MEASUREMENT,
  BrakeEvidenceSource.INSPECTION_PROTOCOL,
  BrakeEvidenceSource.DOCUMENTED_REPLACEMENT,
  BrakeEvidenceSource.BRAKE_WEAR_SENSOR,
]);

export type BrakeEvidenceLifecycleRow = {
  id?: string;
  source: BrakeEvidenceSource | string;
  axle?: BrakeAxle | string | null;
  wheelPosition?: BrakeWheelPosition | string | null;
  measuredPadMm?: number | null;
  measuredDiscMm?: number | null;
  discCondition?: BrakeComponentStatus | string | null;
  brakeFluidStatus?: BrakeComponentStatus | string | null;
  immediateReplacement?: boolean | null;
  dtcSeverity?: string | null;
  dtcActive?: boolean | null;
  dtcFreshness?: string | null;
  dtcCode?: string | null;
  active?: boolean | null;
  firstObservedAt?: Date | string | null;
  lastObservedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  sourceTimestamp?: Date | string | null;
  freshnessStatus?: BrakeEvidenceFreshnessStatus | string | null;
  confirmationStatus?: BrakeEvidenceConfirmationStatus | string | null;
  supersededByEvidenceId?: string | null;
  externalSourceId?: string | null;
  serviceEventId?: string | null;
  measuredAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export interface EvidenceDedupeInput {
  organizationId: string;
  vehicleId: string;
  source: BrakeEvidenceSource;
  axle?: BrakeAxle;
  wheelPosition?: BrakeWheelPosition | null;
  externalSourceId?: string | null;
  measuredPadMm?: number | null;
  measuredDiscMm?: number | null;
  discCondition?: BrakeComponentStatus | null;
  brakeFluidStatus?: BrakeComponentStatus | null;
  immediateReplacement?: boolean | null;
  dtcSeverity?: string | null;
  dtcCode?: string | null;
  sourceTimestamp?: Date | null;
  serviceEventId?: string | null;
}

export interface AggregatedSafetySignal {
  evidenceId?: string;
  source: string;
  axle?: string | null;
  severity: 'info' | 'warning' | 'critical';
  condition: BrakeCondition;
  reason: string;
  freshnessStatus: BrakeEvidenceFreshnessStatus;
}

export interface AggregatedSafetySignals {
  severity: 'info' | 'warning' | 'critical';
  condition: BrakeCondition;
  reasons: string[];
  freshnessStatus: BrakeEvidenceFreshnessStatus;
  signals: AggregatedSafetySignal[];
}

const SEVERITY_RANK: Record<'info' | 'warning' | 'critical', number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

const FRESHNESS_RANK: Record<BrakeEvidenceFreshnessStatus, number> = {
  UNKNOWN: 0,
  FRESH: 3,
  STALE: 2,
  EXPIRED: 1,
};

export function isMeasurementSource(source: BrakeEvidenceSource | string): boolean {
  return MEASUREMENT_SOURCES.has(source as BrakeEvidenceSource);
}

export function isEstimationSource(source: BrakeEvidenceSource | string): boolean {
  return ESTIMATION_SOURCES.has(source as BrakeEvidenceSource);
}

export function isMmGroundTruthSource(source: BrakeEvidenceSource | string): boolean {
  return MM_GROUND_TRUTH_SOURCES.has(source as BrakeEvidenceSource);
}

export function defaultConfirmationStatusForSource(
  source: BrakeEvidenceSource,
): BrakeEvidenceConfirmationStatus {
  switch (source) {
    case BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED:
      return BrakeEvidenceConfirmationStatus.UNCONFIRMED;
    case BrakeEvidenceSource.AI_UPLOAD_CONFIRMED:
    case BrakeEvidenceSource.MANUAL_MEASUREMENT:
    case BrakeEvidenceSource.WORKSHOP_MEASUREMENT:
    case BrakeEvidenceSource.INSPECTION_PROTOCOL:
    case BrakeEvidenceSource.DOCUMENTED_REPLACEMENT:
      return BrakeEvidenceConfirmationStatus.CONFIRMED;
    default:
      return BrakeEvidenceConfirmationStatus.NOT_APPLICABLE;
  }
}

export function timestampBucket(date: Date, bucketMs = cfg.timestampBucketMs): string {
  const ms = date.getTime();
  const bucket = Math.floor(ms / bucketMs) * bucketMs;
  return new Date(bucket).toISOString();
}

function valueKeyForDedupe(input: EvidenceDedupeInput): string {
  const parts: string[] = [];
  if (input.measuredPadMm != null) parts.push(`pad:${input.measuredPadMm}`);
  if (input.measuredDiscMm != null) parts.push(`disc:${input.measuredDiscMm}`);
  if (input.discCondition) parts.push(`discCond:${input.discCondition}`);
  if (input.brakeFluidStatus) parts.push(`fluid:${input.brakeFluidStatus}`);
  if (input.immediateReplacement === true) parts.push('immediate');
  if (input.dtcSeverity) parts.push(`dtcSev:${input.dtcSeverity}`);
  if (input.dtcCode) parts.push(`dtc:${input.dtcCode}`);
  return parts.length ? parts.join('|') : 'signal';
}

/**
 * Stable dedupe key across org + vehicle + component + source + external id +
 * value fingerprint + timestamp bucket + service event.
 */
export function buildEvidenceDedupeKey(input: EvidenceDedupeInput): string {
  const observedAt = input.sourceTimestamp ?? new Date();
  const bucket = timestampBucket(observedAt);
  const axle = input.axle ?? BrakeAxle.UNKNOWN;
  const wheel = input.wheelPosition ?? 'ALL';
  const external = input.externalSourceId?.trim() || '-';
  const service = input.serviceEventId ?? '-';
  const value = valueKeyForDedupe(input);
  return [
    input.source,
    axle,
    wheel,
    external,
    value,
    bucket,
    service,
  ].join('::');
}

export function computeImmediateReplacementExpiresAt(
  observedAt: Date,
  now = new Date(),
): Date {
  const base = observedAt.getTime() > now.getTime() ? observedAt : now;
  return new Date(base.getTime() + cfg.immediateReplacementTtlDays * 86_400_000);
}

export function computeProviderWarningExpiresAt(observedAt: Date, now = new Date()): Date {
  const base = observedAt.getTime() > now.getTime() ? observedAt : now;
  return new Date(base.getTime() + cfg.providerWarningTtlDays * 86_400_000);
}

export function mapDtcFreshnessToEvidenceFreshness(
  dtcFreshness: string | null | undefined,
): BrakeEvidenceFreshnessStatus {
  switch ((dtcFreshness ?? '').toUpperCase()) {
    case 'FRESH':
      return BrakeEvidenceFreshnessStatus.FRESH;
    case 'STALE':
      return BrakeEvidenceFreshnessStatus.STALE;
    default:
      return BrakeEvidenceFreshnessStatus.UNKNOWN;
  }
}

export function resolveEffectiveFreshness(
  row: BrakeEvidenceLifecycleRow,
  now = new Date(),
): BrakeEvidenceFreshnessStatus {
  const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
    return BrakeEvidenceFreshnessStatus.EXPIRED;
  }

  if (row.freshnessStatus) {
    const status = String(row.freshnessStatus).toUpperCase() as BrakeEvidenceFreshnessStatus;
    if (status === BrakeEvidenceFreshnessStatus.EXPIRED) return status;
    if (status === BrakeEvidenceFreshnessStatus.STALE) return status;
    if (status === BrakeEvidenceFreshnessStatus.FRESH) return status;
  }

  if (row.source === BrakeEvidenceSource.DTC_SIGNAL && row.dtcFreshness) {
    const mapped = mapDtcFreshnessToEvidenceFreshness(row.dtcFreshness);
    if (mapped !== BrakeEvidenceFreshnessStatus.UNKNOWN) return mapped;
  }

  const observedAt = row.lastObservedAt ?? row.sourceTimestamp ?? row.measuredAt ?? row.createdAt;
  if (observedAt) {
    const ageDays = Math.max(
      0,
      Math.floor((now.getTime() - new Date(observedAt).getTime()) / 86_400_000),
    );
    if (ageDays > cfg.staleAfterDays) return BrakeEvidenceFreshnessStatus.STALE;
    return BrakeEvidenceFreshnessStatus.FRESH;
  }

  return BrakeEvidenceFreshnessStatus.UNKNOWN;
}

export function isActiveEvidence(row: BrakeEvidenceLifecycleRow, now = new Date()): boolean {
  if (row.active === false) return false;
  if (row.supersededByEvidenceId) return false;
  if (row.resolvedAt) return false;

  const freshness = resolveEffectiveFreshness(row, now);
  if (freshness === BrakeEvidenceFreshnessStatus.EXPIRED) return false;

  const source = String(row.source).toUpperCase();
  if (source === BrakeEvidenceSource.DTC_SIGNAL) {
    if (row.dtcActive === false) return false;
    if (freshness === BrakeEvidenceFreshnessStatus.STALE) return false;
    if (row.dtcFreshness === 'STALE') return false;
    return typeof row.dtcSeverity === 'string' && row.dtcSeverity.trim().length > 0;
  }

  if (source === BrakeEvidenceSource.PROVIDER_WARNING) {
    return freshness !== BrakeEvidenceFreshnessStatus.STALE;
  }

  if (row.immediateReplacement === true) {
    return freshness !== BrakeEvidenceFreshnessStatus.STALE;
  }

  return true;
}

export function isMmGroundTruth(row: BrakeEvidenceLifecycleRow, now = new Date()): boolean {
  if (!isActiveEvidence(row, now)) return false;
  if (!isMmGroundTruthSource(row.source)) return false;
  if (row.confirmationStatus === BrakeEvidenceConfirmationStatus.UNCONFIRMED) return false;
  if (row.source === BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED) return false;
  return row.measuredPadMm != null || row.measuredDiscMm != null;
}

export function shouldAutoSupersedeExisting(
  existing: BrakeEvidenceLifecycleRow,
  incomingSource: BrakeEvidenceSource,
): boolean {
  if (isMeasurementSource(existing.source) && isEstimationSource(incomingSource)) {
    return false;
  }
  return false;
}

export function carriesSafetySignal(row: BrakeEvidenceLifecycleRow): boolean {
  if (!SAFETY_SIGNAL_SOURCES.has(row.source as BrakeEvidenceSource)) {
    if (
      row.immediateReplacement === true ||
      row.brakeFluidStatus != null ||
      row.discCondition != null ||
      row.dtcSeverity != null
    ) {
      return true;
    }
    return false;
  }
  return (
    row.immediateReplacement === true ||
    row.brakeFluidStatus != null ||
    row.discCondition != null ||
    (typeof row.dtcSeverity === 'string' && row.dtcSeverity.trim().length > 0)
  );
}

function conditionToPublicSeverity(condition: BrakeCondition): 'info' | 'warning' | 'critical' {
  if (condition === 'CRITICAL') return 'critical';
  if (condition === 'WARNING' || condition === 'WATCH') return 'warning';
  return 'info';
}

function buildSafetyReason(row: BrakeEvidenceLifecycleRow): string | null {
  if (row.immediateReplacement === true) return 'Sofortiger Bremsenersatz dokumentiert';
  if (row.dtcCode && row.dtcSeverity) {
    return `DTC ${row.dtcCode} (${row.dtcSeverity})`;
  }
  if (row.dtcSeverity) return `Bremsen-DTC (${row.dtcSeverity})`;
  if (row.brakeFluidStatus) return `Bremsflüssigkeit ${row.brakeFluidStatus}`;
  if (row.discCondition) return `Bremsscheibe ${row.discCondition}`;
  if (row.source === BrakeEvidenceSource.BRAKE_WEAR_SENSOR) return 'Bremsverschleißsensor';
  if (row.source === BrakeEvidenceSource.PROVIDER_WARNING) return 'Anbieter-Warnung Bremsen';
  return null;
}

function rowSafetyCondition(row: BrakeEvidenceLifecycleRow): BrakeCondition {
  let condition: BrakeCondition = 'UNKNOWN';
  if (row.brakeFluidStatus) {
    condition = aggregateBrakeCondition(condition, classifyFluidStatus(row.brakeFluidStatus));
  }
  if (row.discCondition) {
    condition = aggregateBrakeCondition(condition, classifyDiscConditionLabel(row.discCondition));
  }
  if (row.dtcSeverity) {
    condition = aggregateBrakeCondition(condition, classifyDtcSeverity(row.dtcSeverity));
  }
  if (row.immediateReplacement === true) {
    condition = aggregateBrakeCondition(condition, 'CRITICAL');
  }
  if (row.source === BrakeEvidenceSource.BRAKE_WEAR_SENSOR && row.measuredPadMm != null) {
    condition = aggregateBrakeCondition(condition, 'WARNING');
  }
  return condition;
}

/**
 * Aggregate all active safety-relevant evidence rows — highest severity plus
 * the full reason list. Stale signals are excluded from the active safety view.
 */
export function aggregateActiveSafetySignals(
  rows: BrakeEvidenceLifecycleRow[],
  now = new Date(),
): AggregatedSafetySignals {
  const signals: AggregatedSafetySignal[] = [];

  for (const row of rows) {
    if (!isActiveEvidence(row, now)) continue;
    if (!carriesSafetySignal(row)) continue;

    const freshness = resolveEffectiveFreshness(row, now);
    if (freshness === BrakeEvidenceFreshnessStatus.STALE) continue;

    const condition = rowSafetyCondition(row);
    if (condition === 'UNKNOWN' || condition === 'GOOD') continue;

    const reason = buildSafetyReason(row);
    if (!reason) continue;

    signals.push({
      evidenceId: row.id,
      source: String(row.source),
      axle: row.axle ?? null,
      severity: conditionToPublicSeverity(condition),
      condition,
      reason,
      freshnessStatus: freshness,
    });
  }

  let aggregateCondition: BrakeCondition = 'UNKNOWN';
  let aggregateSeverity: 'info' | 'warning' | 'critical' = 'info';
  let aggregateFreshness: BrakeEvidenceFreshnessStatus = BrakeEvidenceFreshnessStatus.UNKNOWN;

  for (const signal of signals) {
    aggregateCondition = aggregateBrakeCondition(aggregateCondition, signal.condition);
    if (SEVERITY_RANK[signal.severity] > SEVERITY_RANK[aggregateSeverity]) {
      aggregateSeverity = signal.severity;
    }
    if (FRESHNESS_RANK[signal.freshnessStatus] < FRESHNESS_RANK[aggregateFreshness]) {
      aggregateFreshness = signal.freshnessStatus;
    }
  }

  return {
    severity: aggregateSeverity,
    condition: aggregateCondition,
    reasons: signals.map((s) => s.reason),
    freshnessStatus:
      signals.length > 0 ? aggregateFreshness : BrakeEvidenceFreshnessStatus.UNKNOWN,
    signals,
  };
}

export function stripUntrustedMm<T extends { measuredPadMm?: number | null; measuredDiscMm?: number | null }>(
  source: BrakeEvidenceSource,
  confirmationStatus: BrakeEvidenceConfirmationStatus,
  values: T,
): T {
  if (source === BrakeEvidenceSource.TELEMATICS_ESTIMATION) {
    return {
      ...values,
      measuredPadMm: null,
      measuredDiscMm: null,
    };
  }
  return values;
}

export function rawMmCountsAsSignal(
  source: BrakeEvidenceSource,
  measuredPadMm: number | null,
  measuredDiscMm: number | null,
): boolean {
  if (source === BrakeEvidenceSource.TELEMATICS_ESTIMATION) return false;
  return measuredPadMm != null || measuredDiscMm != null;
}

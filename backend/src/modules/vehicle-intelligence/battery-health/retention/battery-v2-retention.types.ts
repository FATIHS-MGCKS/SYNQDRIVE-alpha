import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryMeasurementQuality,
} from '@prisma/client';

export type BatteryV2RetentionTrigger = 'cron' | 'manual';

export interface BatteryV2RetentionPhaseResult {
  phase: string;
  scanned: number;
  aggregated: number;
  deleted: number;
  skipped: number;
  dryRun: boolean;
}

export interface BatteryV2RetentionReport {
  trigger: BatteryV2RetentionTrigger;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: BatteryV2RetentionPhaseResult[];
  totals: {
    aggregated: number;
    deleted: number;
    skipped: number;
  };
}

export interface BatteryV2RetentionDaysConfig {
  lvProviderSnapshots: number;
  hvProviderSnapshots: number;
  measurementsLv: number;
  measurementsHv: number;
  measurementSessions: number;
  assessmentsDetail: number;
  hvChargeSessions: number;
  hvCapacityObservations: number;
  evidenceShadowOnly: number;
  capabilityChanges: number;
  deadLetters: number;
  publications: number;
  qualifiedEvidence: number;
  aggregates: number;
}

export interface BatteryV2RetentionRunOptions {
  trigger?: BatteryV2RetentionTrigger;
  dryRunOverride?: boolean;
}

const QUALIFIED_EVIDENCE_SOURCE_TYPES = new Set<BatteryEvidenceSourceType>([
  BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
  BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
  BatteryEvidenceSourceType.MANUAL_REPORT,
  BatteryEvidenceSourceType.HM_SUPPLEMENTARY,
]);

const SHADOW_MEASUREMENT_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.SHADOW,
  BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
  BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
  BatteryMeasurementQuality.CONTAMINATED_BY_LOAD,
  BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
  BatteryMeasurementQuality.MISSED,
  BatteryMeasurementQuality.INSUFFICIENT_CADENCE,
  BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
  BatteryMeasurementQuality.STALE,
  BatteryMeasurementQuality.MISSING_CONTEXT,
  BatteryMeasurementQuality.PROVIDER_DELAY,
  BatteryMeasurementQuality.PROVIDER_ERROR,
  BatteryMeasurementQuality.NO_DATA,
  BatteryMeasurementQuality.UNSUPPORTED_PROFILE,
  BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
]);

export function retentionCutoff(days: number, now = Date.now()): Date | null {
  if (days <= 0) return null;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isQualifiedBatteryEvidence(input: {
  sourceType: BatteryEvidenceSourceType;
  documentExtractionId: string | null;
  serviceEventId: string | null;
}): boolean {
  if (input.documentExtractionId || input.serviceEventId) return true;
  return QUALIFIED_EVIDENCE_SOURCE_TYPES.has(input.sourceType);
}

export function isShadowOnlyBatteryEvidence(input: {
  sourceType: BatteryEvidenceSourceType;
  documentExtractionId: string | null;
  serviceEventId: string | null;
  quality: string | null;
}): boolean {
  if (isQualifiedBatteryEvidence(input)) return false;
  if (input.sourceType === BatteryEvidenceSourceType.PROVIDER_REPORTED) return true;
  if (input.sourceType === BatteryEvidenceSourceType.TELEMETRY_DERIVED) return true;
  if (input.sourceType === BatteryEvidenceSourceType.MODEL_DERIVED) return true;
  const quality = (input.quality ?? '').toUpperCase();
  return quality.includes('SHADOW') || quality.includes('CONTAMINATED');
}

export function measurementRetentionDays(
  scope: BatteryEvidenceScope,
  days: BatteryV2RetentionDaysConfig,
): number {
  return scope === BatteryEvidenceScope.HV
    ? days.measurementsHv
    : days.measurementsLv;
}

export function isShadowMeasurementQuality(quality: BatteryMeasurementQuality): boolean {
  return SHADOW_MEASUREMENT_QUALITIES.has(quality);
}

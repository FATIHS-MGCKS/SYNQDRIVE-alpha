/**
 * EXP-021 C0.3B — read-time presentation containment for persisted misuse cases.
 *
 * Does not mutate persistence. Re-applies R1 temporal tagging and rating caps so
 * existing SEVERE rows backed only by time-uncertain R1 OBD evidence are not
 * presented as fully qualified judgments.
 */
import {
  MisuseAttributionScope,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseStatus,
  MisuseCaseType,
  type MisuseCase,
  type MisuseCaseEvidence,
} from '@prisma/client';
import {
  hasUncertainHistoricalObdRecordTime,
  type TelemetrySourceFamily,
} from '../telemetry-source-family';
import {
  R1_OBD_RECORD_TIME_UNCERTAIN,
  R1_TEMPORAL_CONTAINMENT_VERSION,
} from '../r1-temporal-containment';
import {
  isTemporallyUncertainEvidence,
  R1_TEMPORALLY_UNCERTAIN_SOURCE_TYPES,
} from './misuse-case-r1-temporal-containment';
import { reconcileMisuseCaseRating } from './misuse-case-rating-reconciliation/misuse-case-rating-reconciliation';
import type { EvidenceCandidate } from './misuse-case.types';
import type { TripEvidenceLevel } from '../trips/trip-evidence-level.types';

export interface MisuseCaseTemporalPresentationContainment {
  version: typeof R1_TEMPORAL_CONTAINMENT_VERSION;
  reason: typeof R1_OBD_RECORD_TIME_UNCERTAIN;
  storedSeverity: MisuseCaseSeverity;
  storedConfidence: MisuseCaseConfidence;
  presentedSeverity: MisuseCaseSeverity;
  presentedConfidence: MisuseCaseConfidence;
  temporallyUncertainOnly: boolean;
}

export type MisuseCaseReadPresentation = {
  severity: MisuseCaseSeverity;
  confidence: MisuseCaseConfidence;
  status: MisuseCaseStatus;
  temporalPresentationContainment: MisuseCaseTemporalPresentationContainment | null;
};

function evidenceRowToCandidate(row: MisuseCaseEvidence): EvidenceCandidate {
  const snapshot =
    row.snapshotJson != null && typeof row.snapshotJson === 'object' && !Array.isArray(row.snapshotJson)
      ? (row.snapshotJson as Record<string, unknown>)
      : null;
  return {
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    snapshotJson: snapshot,
  };
}

function retroactiveTagR1Evidence(
  evidence: EvidenceCandidate[],
  family: TelemetrySourceFamily,
): EvidenceCandidate[] {
  if (!hasUncertainHistoricalObdRecordTime(family)) return evidence;
  return evidence.map((item) => {
    if (!R1_TEMPORALLY_UNCERTAIN_SOURCE_TYPES.has(item.sourceType)) return item;
    if (isTemporallyUncertainEvidence(item)) return item;
    return {
      ...item,
      snapshotJson: {
        ...(item.snapshotJson ?? {}),
        temporalProvenance: R1_OBD_RECORD_TIME_UNCERTAIN,
      },
    };
  });
}

/**
 * Presentation-layer severity/confidence/status for API reads.
 * CONFIRMED human decisions are never downgraded here.
 */
export function presentMisuseCaseForRead(input: {
  row: MisuseCase & { evidence: MisuseCaseEvidence[] };
  telemetrySourceFamily: TelemetrySourceFamily | null;
}): MisuseCaseReadPresentation {
  const { row } = input;
  const family = input.telemetrySourceFamily ?? 'UNKNOWN';

  if (row.status === MisuseCaseStatus.CONFIRMED) {
    return {
      severity: row.severity,
      confidence: row.confidence,
      status: row.status,
      temporalPresentationContainment: null,
    };
  }

  if (!hasUncertainHistoricalObdRecordTime(family)) {
    return {
      severity: row.severity,
      confidence: row.confidence,
      status: row.status,
      temporalPresentationContainment: null,
    };
  }

  const evidenceSummary = row.evidenceSummary as Record<string, unknown> | null;
  const evidenceCase = evidenceSummary?.evidenceCase as
    | { evidenceLevel?: TripEvidenceLevel }
    | undefined;
  const evidenceLevel = evidenceCase?.evidenceLevel ?? 'CHECK_RECOMMENDED';

  const qualifiedEvidence = retroactiveTagR1Evidence(
    row.evidence.map(evidenceRowToCandidate),
    family,
  );

  const rating = reconcileMisuseCaseRating({
    caseType: row.type as MisuseCaseType,
    qualifiedEvidence,
    evidenceLevel,
    attributionScope: row.attributionScope as MisuseAttributionScope,
    attributionConfidence: row.attributionConfidence as import('@prisma/client').DrivingAttributionConfidence,
    clusterCount: (evidenceSummary?.clusterCount as number | undefined) ?? undefined,
    coverageQuality: evidenceSummary?.coverageQuality as 'NONE' | 'SPARSE' | 'GOOD' | undefined,
    modelVersion: row.modelVersion,
    existingSeverity: row.severity,
    existingConfidence: row.confidence,
  });

  const severityChanged =
    rating.severity !== row.severity || rating.confidence !== row.confidence;
  const needsReviewPresentation =
    rating.temporallyUncertainOnly && row.status !== MisuseCaseStatus.REVIEW_REQUIRED;

  const temporalPresentationContainment: MisuseCaseTemporalPresentationContainment | null =
    severityChanged || rating.temporallyUncertainOnly
      ? {
          version: R1_TEMPORAL_CONTAINMENT_VERSION,
          reason: R1_OBD_RECORD_TIME_UNCERTAIN,
          storedSeverity: row.severity,
          storedConfidence: row.confidence,
          presentedSeverity: rating.severity,
          presentedConfidence: rating.confidence,
          temporallyUncertainOnly: rating.temporallyUncertainOnly,
        }
      : null;

  return {
    severity: rating.severity,
    confidence: rating.confidence,
    status: needsReviewPresentation ? MisuseCaseStatus.REVIEW_REQUIRED : row.status,
    temporalPresentationContainment,
  };
}

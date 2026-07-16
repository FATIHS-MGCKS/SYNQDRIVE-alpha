import { MisuseEvidenceSourceType } from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';
import { MISUSE_CASE_TEMPORAL_BUCKET_MS } from '../misuse-case-fingerprint/misuse-case-fingerprint.config';
import {
  MISUSE_EVENT_COUNT_VERSION,
  UNQUALIFIED_AGGREGATE_SOURCE_TYPES,
} from './misuse-case-evidence-count.config';
import type {
  MisuseCaseEvidenceRecalculation,
  RejectedEvidenceAuditEntry,
  RejectedEvidenceReason,
} from './misuse-case-evidence-count.types';

const AGGREGATE_SOURCES = new Set<string>(UNQUALIFIED_AGGREGATE_SOURCE_TYPES);

function temporalBucketKey(occurredAt: Date): string {
  const bucket = Math.floor(occurredAt.getTime() / MISUSE_CASE_TEMPORAL_BUCKET_MS);
  return `bucket:${bucket}`;
}

/**
 * Stable per-evidence qualification key — aligned with misuse fingerprint keys (P48).
 */
export function buildEvidenceQualificationKey(item: EvidenceCandidate): string {
  if (item.sourceId) {
    return `${item.sourceType}:${item.sourceId}`;
  }
  const bucket = temporalBucketKey(item.occurredAt);
  if (item.sourceType === MisuseEvidenceSourceType.DERIVED_PATTERN) {
    return `${item.sourceType}:${bucket}`;
  }
  return `${item.sourceType}:${item.eventType}:${bucket}`;
}

function rejectionReason(item: EvidenceCandidate): RejectedEvidenceReason {
  if (AGGREGATE_SOURCES.has(item.sourceType)) {
    return 'AGGREGATE_SOURCE';
  }
  return 'UNQUALIFIED_PROXY';
}

export function isQualifiedEvidenceCandidate(item: EvidenceCandidate): boolean {
  if (AGGREGATE_SOURCES.has(item.sourceType)) {
    return false;
  }
  if (item.sourceId) {
    return true;
  }
  if (item.sourceType === MisuseEvidenceSourceType.DERIVED_PATTERN) {
    return true;
  }
  return false;
}

/**
 * Deterministic qualified evidence selection for eventCount (P49).
 * Does not accumulate across reprocessing runs — evaluates the current candidate batch only.
 */
export function selectQualifiedEvidence(
  evidence: EvidenceCandidate[],
): { qualified: EvidenceCandidate[]; rejected: RejectedEvidenceAuditEntry[] } {
  const qualified: EvidenceCandidate[] = [];
  const rejected: RejectedEvidenceAuditEntry[] = [];
  const seenKeys = new Set<string>();

  for (const item of evidence) {
    const key = buildEvidenceQualificationKey(item);

    if (!isQualifiedEvidenceCandidate(item)) {
      rejected.push({
        key,
        sourceType: item.sourceType,
        eventType: item.eventType,
        reason: rejectionReason(item),
      });
      continue;
    }

    if (seenKeys.has(key)) {
      rejected.push({
        key,
        sourceType: item.sourceType,
        eventType: item.eventType,
        reason: 'DUPLICATE_IN_EVALUATION',
      });
      continue;
    }

    seenKeys.add(key);
    qualified.push(item);
  }

  return { qualified, rejected };
}

/**
 * Recalculate eventCount from the current evaluation input — never from legacy stored counters.
 */
export function recalculateMisuseCaseEvidenceCounts(
  evidence: EvidenceCandidate[],
): MisuseCaseEvidenceRecalculation {
  const { qualified, rejected } = selectQualifiedEvidence(evidence);
  const qualifiedEvidenceKeys = qualified.map((item) => buildEvidenceQualificationKey(item)).sort();

  return {
    eventCount: qualifiedEvidenceKeys.length,
    qualifiedEvidence: qualified,
    qualifiedEvidenceKeys,
    rejectedEvidence: rejected,
    modelVersion: MISUSE_EVENT_COUNT_VERSION,
  };
}

export function buildRejectedEvidenceAudit(
  recalculation: MisuseCaseEvidenceRecalculation,
  evaluatedAt: Date = new Date(),
): {
  rejectedEvidenceAudit: {
    modelVersion: string;
    rejected: RejectedEvidenceAuditEntry[];
    qualifiedCount: number;
    evaluatedAt: string;
  };
} {
  return {
    rejectedEvidenceAudit: {
      modelVersion: recalculation.modelVersion,
      rejected: recalculation.rejectedEvidence,
      qualifiedCount: recalculation.eventCount,
      evaluatedAt: evaluatedAt.toISOString(),
    },
  };
}

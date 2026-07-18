import {
  CONFIDENCE_LEVELS,
  ENTITY_CANDIDATE_RANKING_VERSION,
  NEGATIVE_REASON_CODES,
  type ConfidenceLevel,
  type EntityCandidateRankDetail,
  type EntityCandidateRankingPipelineState,
  type EntityCandidateRankingPolicyInput,
  type EntityCandidateType,
  type NegativeReasonCode,
  type RankedEntityCandidate,
} from './entity-candidate-ranking.types';

const HIGH_THRESHOLD = 0.85;
const MEDIUM_THRESHOLD = 0.55;

const DOCUMENT_ENTITY_WEIGHTS: Record<string, Partial<Record<EntityCandidateType, number>>> = {
  FINE: {
    VEHICLE: 1.05,
    BOOKING: 1.1,
    CUSTOMER: 1.0,
    DRIVER: 1.15,
    PARTNER: 0.9,
  },
  INVOICE: {
    VEHICLE: 0.95,
    BOOKING: 0.9,
    CUSTOMER: 1.1,
    DRIVER: 0.85,
    PARTNER: 1.2,
  },
  SERVICE: {
    VEHICLE: 1.0,
    BOOKING: 0.95,
    CUSTOMER: 1.0,
    DRIVER: 0.9,
    PARTNER: 1.15,
  },
  OIL_CHANGE: {
    VEHICLE: 1.0,
    PARTNER: 1.15,
  },
  TIRE: {
    VEHICLE: 1.05,
    PARTNER: 1.1,
  },
  BRAKE: {
    VEHICLE: 1.05,
    PARTNER: 1.1,
  },
  BATTERY: {
    VEHICLE: 1.0,
    PARTNER: 1.1,
  },
  TUV_REPORT: {
    VEHICLE: 1.05,
    PARTNER: 1.15,
  },
  BOKRAFT_REPORT: {
    VEHICLE: 1.05,
    PARTNER: 1.15,
  },
  DAMAGE: {
    VEHICLE: 1.05,
    BOOKING: 1.05,
    CUSTOMER: 1.05,
    DRIVER: 1.1,
    PARTNER: 1.1,
  },
  ACCIDENT: {
    VEHICLE: 1.05,
    BOOKING: 1.05,
    CUSTOMER: 1.05,
    DRIVER: 1.1,
    PARTNER: 1.15,
  },
};

function resolveDocumentEntityWeight(documentType: string, entityType: EntityCandidateType): number {
  const weights = DOCUMENT_ENTITY_WEIGHTS[documentType] ?? {};
  return weights[entityType] ?? 1;
}

export function resolveConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return CONFIDENCE_LEVELS.HIGH;
  if (score >= MEDIUM_THRESHOLD) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

function buildNegativeReasons(input: {
  conflicts: EntityCandidateRankDetail['conflicts'];
  weakSignalOnly?: boolean;
  belowHighThreshold: boolean;
  multipleAboveThreshold: boolean;
  contextConflict: boolean;
}): NegativeReasonCode[] {
  const reasons = new Set<NegativeReasonCode>();

  if (input.conflicts.some((conflict) => conflict.severity === 'BLOCKER')) {
    reasons.add(NEGATIVE_REASON_CODES.BLOCKER_CONFLICT);
  }
  if (input.conflicts.some((conflict) => conflict.severity === 'WARNING')) {
    reasons.add(NEGATIVE_REASON_CODES.WARNING_CONFLICT);
  }
  if (input.weakSignalOnly) {
    reasons.add(NEGATIVE_REASON_CODES.WEAK_SIGNAL_ONLY);
  }
  if (input.belowHighThreshold) {
    reasons.add(NEGATIVE_REASON_CODES.BELOW_HIGH_THRESHOLD);
  }
  if (input.multipleAboveThreshold) {
    reasons.add(NEGATIVE_REASON_CODES.MULTIPLE_ABOVE_THRESHOLD);
  }
  if (input.contextConflict) {
    reasons.add(NEGATIVE_REASON_CODES.CONTEXT_CONFLICT);
  }

  return [...reasons];
}

export function applyEntityCandidateRankingPolicy(
  input: EntityCandidateRankingPolicyInput,
): EntityCandidateRankingPipelineState {
  const contextConflict = input.uploadContextResolverStatus === 'CONFLICT';
  const weighted = input.items.map((item) => {
    const weight = resolveDocumentEntityWeight(input.documentType, item.entityType);
    const score = Math.min(1, Math.round(item.baseScore * weight * 1000) / 1000);
    return { ...item, score };
  });

  const byEntityType = new Map<EntityCandidateType, typeof weighted>();
  for (const item of weighted) {
    const group = byEntityType.get(item.entityType) ?? [];
    group.push(item);
    byEntityType.set(item.entityType, group);
  }

  const aboveHighByType = new Map<EntityCandidateType, number>();
  for (const [entityType, group] of byEntityType.entries()) {
    aboveHighByType.set(
      entityType,
      group.filter((item) => item.score >= HIGH_THRESHOLD).length,
    );
  }

  const rankedCandidates: RankedEntityCandidate[] = [];

  for (const [entityType, group] of byEntityType.entries()) {
    const sorted = [...group].sort(
      (a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId),
    );
    const multipleAboveThreshold = (aboveHighByType.get(entityType) ?? 0) > 1;

    sorted.forEach((item, index) => {
      const confidenceLevel = resolveConfidenceLevel(item.score);
      const hasBlocker = item.conflicts.some((conflict) => conflict.severity === 'BLOCKER');
      const negativeReasons = buildNegativeReasons({
        conflicts: item.conflicts,
        weakSignalOnly: item.weakSignalOnly,
        belowHighThreshold: item.score < HIGH_THRESHOLD,
        multipleAboveThreshold,
        contextConflict,
      });

      const autoSelectEligibility =
        !contextConflict &&
        !hasBlocker &&
        !multipleAboveThreshold &&
        confidenceLevel === CONFIDENCE_LEVELS.HIGH &&
        !item.weakSignalOnly;

      rankedCandidates.push({
        entityType,
        entityId: item.entityId,
        ranking: {
          score: item.score,
          confidenceLevel,
          positiveReasons: item.positiveReasons,
          negativeReasons,
          conflicts: item.conflicts,
          rank: index + 1,
          autoSelectEligibility,
        },
      });
    });
  }

  rankedCandidates.sort(
    (a, b) =>
      b.ranking.score - a.ranking.score ||
      a.entityType.localeCompare(b.entityType) ||
      a.entityId.localeCompare(b.entityId),
  );

  const preselectionBlocked =
    contextConflict ||
    [...byEntityType.values()].some((group) => {
      const highCount = group.filter((item) => item.score >= HIGH_THRESHOLD).length;
      return highCount > 1;
    });

  const preselectionBlockedReason = contextConflict
    ? 'Upload-Kontext widerspricht OCR-Signalen'
    : preselectionBlocked
      ? 'Mehrere Kandidaten oberhalb der High-Confidence-Schwelle'
      : null;

  return {
    rankingVersion: ENTITY_CANDIDATE_RANKING_VERSION,
    evaluatedAt: new Date().toISOString(),
    documentType: input.documentType,
    preselectionBlocked,
    preselectionBlockedReason,
    candidates: rankedCandidates,
  };
}

export function readEntityCandidateRankingPipelineState(
  plausibility: unknown,
): EntityCandidateRankingPipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const entityCandidateRanking = (pipeline as Record<string, unknown>).entityCandidateRanking;
  if (
    !entityCandidateRanking ||
    typeof entityCandidateRanking !== 'object' ||
    Array.isArray(entityCandidateRanking)
  ) {
    return null;
  }
  return entityCandidateRanking as EntityCandidateRankingPipelineState;
}

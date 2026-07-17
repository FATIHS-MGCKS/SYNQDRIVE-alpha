import type { DocumentEntityType } from '@prisma/client';
import type {
  DocumentEntityConflict,
  DocumentEntityMatchReason,
  ProposedDocumentEntityCandidateInput,
} from './document-entity.types';

export type RankedDocumentEntityCandidate<T extends ProposedDocumentEntityCandidateInput> = T & {
  rank: number;
};

function confidenceValue(confidence: number | null | undefined): number {
  if (confidence == null || Number.isNaN(confidence)) return -1;
  return confidence;
}

function stableEntityId(entityId: string | null | undefined): string {
  return entityId?.trim() ?? '';
}

/**
 * Rank candidates per entity type by confidence (desc), then entityId for stability.
 * Multiple candidates per type are allowed — rank starts at 1 within each type group.
 */
export function rankDocumentEntityCandidates<T extends ProposedDocumentEntityCandidateInput>(
  candidates: T[],
): Array<RankedDocumentEntityCandidate<T>> {
  const grouped = new Map<DocumentEntityType, T[]>();

  for (const candidate of candidates) {
    const bucket = grouped.get(candidate.entityType) ?? [];
    bucket.push(candidate);
    grouped.set(candidate.entityType, bucket);
  }

  const ranked: Array<RankedDocumentEntityCandidate<T>> = [];

  for (const entityType of [...grouped.keys()].sort()) {
    const sorted = [...(grouped.get(entityType) ?? [])].sort((left, right) => {
      const confidenceDiff =
        confidenceValue(right.confidence) - confidenceValue(left.confidence);
      if (confidenceDiff !== 0) return confidenceDiff;
      return stableEntityId(left.entityId).localeCompare(stableEntityId(right.entityId));
    });

    sorted.forEach((candidate, index) => {
      ranked.push({
        ...candidate,
        rank: index + 1,
      });
    });
  }

  return ranked;
}

export function normalizeMatchReasons(
  reasons: DocumentEntityMatchReason[] | undefined,
): DocumentEntityMatchReason[] {
  return (reasons ?? []).map((reason) => ({
    code: reason.code.trim(),
    detail: reason.detail?.trim() || undefined,
  }));
}

export function normalizeConflicts(
  conflicts: DocumentEntityConflict[] | undefined,
): DocumentEntityConflict[] {
  return (conflicts ?? []).map((conflict) => ({
    code: conflict.code.trim(),
    detail: conflict.detail?.trim() || undefined,
    severity: conflict.severity,
  }));
}

export function pickTopCandidatePerEntityType<T extends { entityType: DocumentEntityType; rank: number }>(
  candidates: T[],
): T[] {
  const bestByType = new Map<DocumentEntityType, T>();
  for (const candidate of candidates) {
    const current = bestByType.get(candidate.entityType);
    if (!current || candidate.rank < current.rank) {
      bestByType.set(candidate.entityType, candidate);
    }
  }
  return [...bestByType.values()].sort((a, b) => a.entityType.localeCompare(b.entityType));
}

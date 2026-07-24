import type { InsightEntityReference } from '@synq/evaluations-insights/insight-entity-references.contract';
import {
  buildEntityReferencesFromRow,
  computeGroupCountFromReferences,
  dedupeEntityReferences,
} from '@synq/evaluations-insights/insight-entity-references';
import type { InsightCandidate } from './insight.types';

export function normalizeCandidateEntityReferences(
  candidate: InsightCandidate,
  organizationId: string,
): InsightEntityReference[] {
  return buildEntityReferencesFromRow(
    {
      id: candidate.dedupeKey,
      type: candidate.type,
      severity: candidate.severity,
      entityScope: candidate.entityScope,
      entityIds: candidate.entityIds,
      metrics: candidate.metrics ?? null,
      timeContext: candidate.timeContext ?? null,
      entityReferences: candidate.entityReferences ?? null,
    },
    organizationId,
  );
}

export function resolvePublishGroupCount(
  candidate: InsightCandidate,
  organizationId: string,
): number {
  const refs = normalizeCandidateEntityReferences(candidate, organizationId);
  const fromRefs = computeGroupCountFromReferences(refs, candidate.entityScope);
  if (fromRefs > 0) return fromRefs;
  return Math.max(candidate.entityIds?.length ?? 0, 1);
}

export function mergeCandidateEntityReferences(
  items: InsightCandidate[],
  organizationId: string,
): InsightEntityReference[] {
  const merged = items.flatMap((item) =>
    normalizeCandidateEntityReferences(item, organizationId).map((ref) => ({
      ...ref,
      relationType: ref.relationType === 'PRIMARY' ? ('GROUP_MEMBER' as const) : ref.relationType,
    })),
  );
  return dedupeEntityReferences(merged);
}

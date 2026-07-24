import type { OrgRecommendation, OrgRecommendationEvent } from '@prisma/client';
import {
  RecommendationMoney,
  RecommendationRecord,
} from './recommendation-domain.types';

export function moneyFromCents(
  cents: number | null | undefined,
  currency: string | null | undefined,
): RecommendationMoney | null {
  if (cents == null || currency == null) return null;
  return { amountMinor: cents, currency };
}

export function mapRecommendationRow(row: OrgRecommendation): RecommendationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    category: row.category,
    title: row.title,
    description: row.description,
    rationale: row.rationale,
    expectedBenefit: moneyFromCents(row.expectedBenefitCents, row.expectedBenefitCurrency),
    estimatedCost: moneyFromCents(row.estimatedCostCents, row.estimatedCostCurrency),
    expectedNetBenefit: moneyFromCents(
      row.expectedNetBenefitCents,
      row.expectedNetBenefitCurrency,
    ),
    confidence: row.confidence,
    priority: row.priority,
    affectedEntities: Array.isArray(row.affectedEntities)
      ? (row.affectedEntities as unknown as RecommendationRecord['affectedEntities'])
      : [],
    ownerId: row.ownerId,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    calculationVersion: row.calculationVersion,
  };
}

export function mapRecommendationEventRow(row: OrgRecommendationEvent) {
  return {
    id: row.id,
    recommendationId: row.recommendationId,
    organizationId: row.organizationId,
    eventType: row.eventType,
    actorUserId: row.actorUserId,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

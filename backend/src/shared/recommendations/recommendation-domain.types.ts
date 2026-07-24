/** Canonical recommendation domain contract — shared between API and persistence mappers. */

export const RECOMMENDATION_CALCULATION_VERSION = 'recommendation-v1';

export type RecommendationSourceType =
  | 'DASHBOARD_INSIGHT'
  | 'EVALUATIONS_INSIGHT'
  | 'EVALUATIONS_RISK'
  | 'MISUSE_CASE'
  | 'MANUAL';

export type RecommendationCategory =
  | 'MAINTENANCE'
  | 'SAFETY'
  | 'COMPLIANCE'
  | 'COST_OPTIMIZATION'
  | 'FLEET_UTILIZATION'
  | 'CUSTOMER_EXPERIENCE'
  | 'OPERATIONAL'
  | 'OTHER';

export type RecommendationConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type RecommendationStatus =
  | 'NEW'
  | 'REVIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'IMPLEMENTED'
  | 'MEASURING_IMPACT'
  | 'COMPLETED'
  | 'CANCELLED';

export type RecommendationAffectedEntityType =
  | 'vehicle'
  | 'booking'
  | 'customer'
  | 'station'
  | 'driver'
  | 'organization';

export interface RecommendationMoney {
  amountMinor: number;
  currency: string;
}

export interface RecommendationAffectedEntity {
  entityType: RecommendationAffectedEntityType;
  entityId: string;
  label?: string;
}

export interface RecommendationRecord {
  id: string;
  organizationId: string;
  sourceType: RecommendationSourceType;
  sourceId: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  rationale: string;
  expectedBenefit: RecommendationMoney | null;
  estimatedCost: RecommendationMoney | null;
  expectedNetBenefit: RecommendationMoney | null;
  confidence: RecommendationConfidence;
  priority: number;
  affectedEntities: RecommendationAffectedEntity[];
  ownerId: string | null;
  dueAt: string | null;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
  calculationVersion: string;
}

export interface CreateRecommendationInput {
  organizationId: string;
  sourceType: RecommendationSourceType;
  sourceId: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  rationale: string;
  expectedBenefit?: RecommendationMoney | null;
  estimatedCost?: RecommendationMoney | null;
  expectedNetBenefit?: RecommendationMoney | null;
  confidence: RecommendationConfidence;
  priority?: number;
  affectedEntities?: RecommendationAffectedEntity[];
  ownerId?: string | null;
  dueAt?: string | null;
  calculationVersion?: string;
}

export interface UpdateRecommendationInput {
  title?: string;
  description?: string;
  rationale?: string;
  expectedBenefit?: RecommendationMoney | null;
  estimatedCost?: RecommendationMoney | null;
  expectedNetBenefit?: RecommendationMoney | null;
  confidence?: RecommendationConfidence;
  priority?: number;
  affectedEntities?: RecommendationAffectedEntity[];
  ownerId?: string | null;
  dueAt?: string | null;
}

export type RecommendationEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'OWNER_ASSIGNED'
  | 'DEDUPLICATED';

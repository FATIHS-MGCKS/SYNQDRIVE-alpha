export type EvaluationsRecommendationStatus =
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

export type EvaluationsRecommendationCategory =
  | 'MAINTENANCE'
  | 'SAFETY'
  | 'COMPLIANCE'
  | 'COST_OPTIMIZATION'
  | 'FLEET_UTILIZATION'
  | 'CUSTOMER_EXPERIENCE'
  | 'OPERATIONAL'
  | 'OTHER';

export type EvaluationsRecommendationConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type EvaluationsRecommendationSourceType =
  | 'DASHBOARD_INSIGHT'
  | 'EVALUATIONS_INSIGHT'
  | 'EVALUATIONS_RISK'
  | 'MISUSE_CASE'
  | 'MANUAL';

export interface EvaluationsRecommendationMoney {
  amountMinor: number;
  currency: string;
}

export interface EvaluationsRecommendationAffectedEntity {
  entityType: string;
  entityId: string;
  label?: string;
}

export interface EvaluationsRecommendationRecord {
  id: string;
  organizationId: string;
  sourceType: EvaluationsRecommendationSourceType;
  sourceId: string;
  category: EvaluationsRecommendationCategory;
  title: string;
  description: string;
  rationale: string;
  expectedBenefit: EvaluationsRecommendationMoney | null;
  estimatedCost: EvaluationsRecommendationMoney | null;
  expectedNetBenefit: EvaluationsRecommendationMoney | null;
  confidence: EvaluationsRecommendationConfidence;
  priority: number;
  affectedEntities: EvaluationsRecommendationAffectedEntity[];
  ownerId: string | null;
  dueAt: string | null;
  status: EvaluationsRecommendationStatus;
  createdAt: string;
  updatedAt: string;
  calculationVersion: string;
}

export interface EvaluationsRecommendationEventRecord {
  id: string;
  recommendationId: string;
  organizationId: string;
  eventType: string;
  actorUserId: string | null;
  previousStatus: EvaluationsRecommendationStatus | null;
  newStatus: EvaluationsRecommendationStatus | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EvaluationsRecommendationListFilters {
  status?: EvaluationsRecommendationStatus;
  category?: EvaluationsRecommendationCategory;
  ownerId?: string;
  minPriority?: number;
}

const STATUS_TRANSITIONS: Record<
  EvaluationsRecommendationStatus,
  EvaluationsRecommendationStatus[]
> = {
  NEW: ['REVIEWED', 'REJECTED', 'CANCELLED'],
  REVIEWED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PLANNED', 'CANCELLED'],
  REJECTED: [],
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IMPLEMENTED', 'CANCELLED'],
  IMPLEMENTED: ['MEASURING_IMPACT', 'COMPLETED', 'CANCELLED'],
  MEASURING_IMPACT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function getRecommendationStatusTransitions(
  status: EvaluationsRecommendationStatus,
): EvaluationsRecommendationStatus[] {
  return STATUS_TRANSITIONS[status] ?? [];
}

export function canManageEvaluationsRecommendations(input: {
  userRole: string | null | undefined;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
}): boolean {
  const role = input.userRole?.toUpperCase() ?? '';
  if (role === 'ORG_ADMIN' || role === 'MASTER_ADMIN' || role === 'SUB_ADMIN') {
    return true;
  }
  return input.hasPermission('tasks', 'manage') || input.hasPermission('tasks', 'write');
}

export function canReadEvaluationsRecommendations(): boolean {
  return true;
}

export function filterRecommendations(
  rows: EvaluationsRecommendationRecord[],
  filters: EvaluationsRecommendationListFilters,
): EvaluationsRecommendationRecord[] {
  return rows
    .filter((row) => (filters.status ? row.status === filters.status : true))
    .filter((row) => (filters.category ? row.category === filters.category : true))
    .filter((row) => (filters.ownerId ? row.ownerId === filters.ownerId : true))
    .filter((row) =>
      filters.minPriority != null ? row.priority >= filters.minPriority : true,
    )
    .sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));
}

export function logEvaluationsRecommendationAudit(event: {
  action: string;
  recommendationId: string;
  status?: string;
  actorUserId?: string | null;
}): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('synqdrive:evaluations-recommendation-audit', { detail: event }),
    );
  }
}

import type {
  EvaluationsRecommendationCategory,
  EvaluationsRecommendationRecord,
} from './evaluations-recommendations';

export type EvaluationsRecommendationIntegrationAction =
  | 'CREATE_TASK'
  | 'OPEN_SERVICE_CASE'
  | 'OPEN_VEHICLE'
  | 'OPEN_BOOKING'
  | 'OPEN_CUSTOMER'
  | 'OPEN_INVOICE'
  | 'START_WORKFLOW'
  | 'ASSIGN_OWNER'
  | 'CREATE_REMINDER'
  | 'OPEN_SETTINGS_INTEGRATIONS';

export type EvaluationsRecommendationIntegrationMode = 'execute' | 'navigate';

export type EvaluationsRecommendationEntityType =
  | 'vehicle'
  | 'booking'
  | 'customer'
  | 'invoice'
  | 'station'
  | 'driver'
  | 'organization';

export interface EvaluationsRecommendationEntityRef {
  entityType: EvaluationsRecommendationEntityType;
  entityId: string;
  label?: string;
}

export type EvaluationsRecommendationIntegrationState =
  | 'AVAILABLE'
  | 'DUPLICATE'
  | 'UNAVAILABLE'
  | 'FORBIDDEN';

export interface EvaluationsRecommendationIntegrationDescriptor {
  action: EvaluationsRecommendationIntegrationAction;
  mode: EvaluationsRecommendationIntegrationMode;
  state: EvaluationsRecommendationIntegrationState;
  entity?: EvaluationsRecommendationEntityRef;
  reason?: string;
  linkedTaskId?: string | null;
  linkedServiceCaseId?: string | null;
  workflowRunIds?: string[];
}

export const RECOMMENDATION_TASK_DEDUP_PREFIX = 'evaluations:recommendation';
export const RECOMMENDATION_REMINDER_DEDUP_SUFFIX = 'reminder';
export const RECOMMENDATION_WORKFLOW_EVENT_TYPE = 'evaluations.recommendation.action';

export function normalizeRecommendationEntityType(
  raw: string,
): EvaluationsRecommendationEntityType | null {
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case 'vehicle':
    case 'booking':
    case 'customer':
    case 'invoice':
    case 'station':
    case 'driver':
    case 'organization':
      return normalized;
    default:
      return null;
  }
}

export function normalizeRecommendationEntities(
  entities: EvaluationsRecommendationRecord['affectedEntities'],
): EvaluationsRecommendationEntityRef[] {
  const out: EvaluationsRecommendationEntityRef[] = [];
  const seen = new Set<string>();
  for (const entity of entities ?? []) {
    const entityType = normalizeRecommendationEntityType(entity.entityType);
    if (!entityType || !entity.entityId?.trim()) continue;
    const key = `${entityType}:${entity.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      entityType,
      entityId: entity.entityId.trim(),
      label: entity.label,
    });
  }
  return out;
}

export function findRecommendationEntity(
  entities: EvaluationsRecommendationRecord['affectedEntities'],
  entityType: EvaluationsRecommendationEntityType,
): EvaluationsRecommendationEntityRef | null {
  return normalizeRecommendationEntities(entities).find((e) => e.entityType === entityType) ?? null;
}

export function buildRecommendationTaskDedupKey(
  recommendationId: string,
  variant: 'task' | 'reminder' = 'task',
): string {
  if (variant === 'reminder') {
    return `${RECOMMENDATION_TASK_DEDUP_PREFIX}:${recommendationId}:${RECOMMENDATION_REMINDER_DEDUP_SUFFIX}`;
  }
  return `${RECOMMENDATION_TASK_DEDUP_PREFIX}:${recommendationId}:task`;
}

export function buildRecommendationWorkflowIdempotencyKey(recommendationId: string): string {
  return `${RECOMMENDATION_TASK_DEDUP_PREFIX}:${recommendationId}:workflow`;
}

export function buildRecommendationTaskMetadata(
  recommendation: Pick<
    EvaluationsRecommendationRecord,
    'id' | 'sourceType' | 'sourceId' | 'category' | 'title' | 'rationale'
  >,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    recommendationId: recommendation.id,
    recommendationSourceType: recommendation.sourceType,
    recommendationSourceId: recommendation.sourceId,
    recommendationCategory: recommendation.category,
    recommendationTitle: recommendation.title,
    recommendationRationale: recommendation.rationale,
    ...extra,
  };
}

export function mapRecommendationPriorityToTaskPriority(priority: number): 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' {
  if (priority >= 80) return 'URGENT';
  if (priority >= 50) return 'HIGH';
  if (priority >= 20) return 'NORMAL';
  return 'LOW';
}

export function mapRecommendationCategoryToServiceCaseCategory(
  category: EvaluationsRecommendationCategory,
): 'SERVICE' | 'REPAIR' | 'INSPECTION' | 'DIAGNOSTIC' {
  switch (category) {
    case 'MAINTENANCE':
      return 'SERVICE';
    case 'SAFETY':
    case 'COMPLIANCE':
      return 'INSPECTION';
    case 'OPERATIONAL':
      return 'REPAIR';
    default:
      return 'DIAGNOSTIC';
  }
}

export function resolveWorkflowActionKey(
  category: EvaluationsRecommendationCategory,
): string | null {
  switch (category) {
    case 'FLEET_UTILIZATION':
      return 'utilization_review';
    case 'COST_OPTIMIZATION':
      return 'pricing_availability_review';
    case 'OPERATIONAL':
      return 'operational_review';
    default:
      return null;
  }
}

export function shouldOfferDataQualityNavigation(
  recommendation: Pick<EvaluationsRecommendationRecord, 'sourceType' | 'category'>,
): boolean {
  return (
    recommendation.sourceType === 'EVALUATIONS_RISK' &&
    (recommendation.category === 'OPERATIONAL' || recommendation.category === 'OTHER')
  );
}

export function listRecommendationIntegrationActions(
  recommendation: EvaluationsRecommendationRecord,
  options?: {
    canManage?: boolean;
    linkedTaskId?: string | null;
    linkedReminderTaskId?: string | null;
    linkedServiceCaseId?: string | null;
  },
): EvaluationsRecommendationIntegrationDescriptor[] {
  const canManage = options?.canManage ?? false;
  const entities = normalizeRecommendationEntities(recommendation.affectedEntities);
  const vehicle = findRecommendationEntity(recommendation.affectedEntities, 'vehicle');
  const booking = findRecommendationEntity(recommendation.affectedEntities, 'booking');
  const customer = findRecommendationEntity(recommendation.affectedEntities, 'customer');
  const invoice = findRecommendationEntity(recommendation.affectedEntities, 'invoice');

  const descriptors: EvaluationsRecommendationIntegrationDescriptor[] = [];

  const pushNavigate = (
    action: EvaluationsRecommendationIntegrationAction,
    entity: EvaluationsRecommendationEntityRef | null,
    reason?: string,
  ) => {
    if (!entity) return;
    descriptors.push({
      action,
      mode: 'navigate',
      state: 'AVAILABLE',
      entity,
      reason,
    });
  };

  const pushExecute = (
    action: EvaluationsRecommendationIntegrationAction,
    state: EvaluationsRecommendationIntegrationState,
    extra?: Partial<EvaluationsRecommendationIntegrationDescriptor>,
  ) => {
    descriptors.push({
      action,
      mode: 'execute',
      state: canManage ? state : 'FORBIDDEN',
      ...extra,
    });
  };

  const maintenanceLike = ['MAINTENANCE', 'SAFETY', 'COMPLIANCE'].includes(recommendation.category);
  const financeLike =
    recommendation.category === 'COST_OPTIMIZATION' ||
    recommendation.sourceType === 'EVALUATIONS_RISK' ||
    invoice != null;

  if (canManage) {
    pushExecute('CREATE_TASK', options?.linkedTaskId ? 'DUPLICATE' : 'AVAILABLE', {
      linkedTaskId: options?.linkedTaskId ?? null,
    });
    pushExecute('CREATE_REMINDER', options?.linkedReminderTaskId ? 'DUPLICATE' : 'AVAILABLE', {
      linkedTaskId: options?.linkedReminderTaskId ?? null,
    });
  } else {
    pushExecute('CREATE_TASK', 'FORBIDDEN');
    pushExecute('CREATE_REMINDER', 'FORBIDDEN');
  }

  if (maintenanceLike && vehicle) {
    pushExecute('OPEN_SERVICE_CASE', options?.linkedServiceCaseId ? 'DUPLICATE' : 'AVAILABLE', {
      entity: vehicle,
      linkedServiceCaseId: options?.linkedServiceCaseId ?? null,
    });
  }

  const workflowKey = resolveWorkflowActionKey(recommendation.category);
  if (workflowKey) {
    pushExecute('START_WORKFLOW', canManage ? 'AVAILABLE' : 'FORBIDDEN', {
      reason: workflowKey,
    });
  }

  pushNavigate('OPEN_VEHICLE', vehicle);
  pushNavigate('OPEN_BOOKING', booking);
  pushNavigate('OPEN_CUSTOMER', customer);
  pushNavigate('OPEN_INVOICE', invoice);

  if (shouldOfferDataQualityNavigation(recommendation)) {
    descriptors.push({
      action: 'OPEN_SETTINGS_INTEGRATIONS',
      mode: 'navigate',
      state: 'AVAILABLE',
      reason: 'data_quality',
    });
  }

  if (entities.length === 0 && descriptors.every((d) => d.mode === 'execute' && d.state === 'FORBIDDEN')) {
    descriptors.push({
      action: 'CREATE_TASK',
      mode: 'execute',
      state: 'UNAVAILABLE',
      reason: 'no_entities',
    });
  }

  return descriptors;
}

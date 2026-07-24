import { BadRequestException } from '@nestjs/common';
import {
  CreateRecommendationInput,
  RecommendationAffectedEntity,
  RecommendationMoney,
  RecommendationSourceType,
  RecommendationStatus,
  UpdateRecommendationInput,
} from './recommendation-domain.types';

const TERMINAL_STATUSES: ReadonlySet<RecommendationStatus> = new Set([
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
]);

const ALLOWED_TRANSITIONS: Readonly<Record<RecommendationStatus, RecommendationStatus[]>> = {
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

/** Entity types that must never be automated targets for adverse operational action. */
const PROTECTED_AUTOMATION_ENTITY_TYPES = new Set(['driver', 'customer']);

export function isTerminalRecommendationStatus(status: RecommendationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function assertRecommendationStatusTransition(
  from: RecommendationStatus,
  to: RecommendationStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException({
      message: `Invalid recommendation status transition: ${from} → ${to}`,
      code: 'RECOMMENDATION_STATUS_TRANSITION_INVALID',
      from,
      to,
    });
  }
}

export function normalizeRecommendationRationale(rationale: string): string {
  const trimmed = rationale?.trim() ?? '';
  if (trimmed.length < 10) {
    throw new BadRequestException({
      message: 'Recommendation rationale is required and must be at least 10 characters',
      code: 'RECOMMENDATION_RATIONALE_REQUIRED',
    });
  }
  return trimmed;
}

export function normalizeRecommendationMoney(
  field: string,
  value: RecommendationMoney | null | undefined,
): { cents: number; currency: string } | null {
  if (value == null) return null;
  if (!Number.isInteger(value.amountMinor)) {
    throw new BadRequestException({
      message: `${field}.amountMinor must be an integer minor unit`,
      code: 'RECOMMENDATION_MONEY_INVALID',
      field,
    });
  }
  const currency = value.currency?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException({
      message: `${field}.currency must be a 3-letter ISO code`,
      code: 'RECOMMENDATION_CURRENCY_INVALID',
      field,
    });
  }
  return { cents: value.amountMinor, currency };
}

export function deriveExpectedNetBenefit(
  expectedBenefit: RecommendationMoney | null | undefined,
  estimatedCost: RecommendationMoney | null | undefined,
  explicit: RecommendationMoney | null | undefined,
): RecommendationMoney | null {
  if (explicit) return explicit;
  if (!expectedBenefit || !estimatedCost) return null;
  if (expectedBenefit.currency !== estimatedCost.currency) return null;
  return {
    amountMinor: expectedBenefit.amountMinor - estimatedCost.amountMinor,
    currency: expectedBenefit.currency,
  };
}

export function normalizeAffectedEntities(
  entities: RecommendationAffectedEntity[] | undefined,
): RecommendationAffectedEntity[] {
  if (!entities?.length) return [];
  const seen = new Set<string>();
  const normalized: RecommendationAffectedEntity[] = [];
  for (const entity of entities) {
    const entityType = entity.entityType?.trim().toLowerCase() as RecommendationAffectedEntity['entityType'];
    const entityId = entity.entityId?.trim();
    if (!entityType || !entityId) continue;
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      entityType,
      entityId,
      ...(entity.label?.trim() ? { label: entity.label.trim() } : {}),
    });
  }
  return normalized;
}

export function buildRecommendationDedupKey(input: {
  organizationId: string;
  sourceType: RecommendationSourceType;
  sourceId: string;
  category: string;
  title: string;
  affectedEntities: RecommendationAffectedEntity[];
}): string {
  const entityKeys = [...input.affectedEntities]
    .map((e) => `${e.entityType}:${e.entityId}`)
    .sort()
    .join('|');
  const normalizedTitle = input.title.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    input.organizationId,
    input.sourceType,
    input.sourceId,
    input.category,
    normalizedTitle,
    entityKeys,
  ].join('::');
}

export function validateCreateRecommendationInput(input: CreateRecommendationInput): void {
  normalizeRecommendationRationale(input.rationale);
  if (!input.title?.trim()) {
    throw new BadRequestException({
      message: 'Recommendation title is required',
      code: 'RECOMMENDATION_TITLE_REQUIRED',
    });
  }
  if (!input.description?.trim()) {
    throw new BadRequestException({
      message: 'Recommendation description is required',
      code: 'RECOMMENDATION_DESCRIPTION_REQUIRED',
    });
  }
  if (!input.sourceId?.trim()) {
    throw new BadRequestException({
      message: 'Recommendation sourceId is required',
      code: 'RECOMMENDATION_SOURCE_REQUIRED',
    });
  }
  assertNoProtectedAutomatedDiscrimination(
    input.sourceType,
    normalizeAffectedEntities(input.affectedEntities),
  );
}

export function validateUpdateRecommendationInput(input: UpdateRecommendationInput): void {
  if (input.rationale !== undefined) {
    normalizeRecommendationRationale(input.rationale);
  }
  if (input.title !== undefined && !input.title.trim()) {
    throw new BadRequestException({
      message: 'Recommendation title cannot be empty',
      code: 'RECOMMENDATION_TITLE_REQUIRED',
    });
  }
  if (input.description !== undefined && !input.description.trim()) {
    throw new BadRequestException({
      message: 'Recommendation description cannot be empty',
      code: 'RECOMMENDATION_DESCRIPTION_REQUIRED',
    });
  }
}

/**
 * Blocks automated recommendations that would target individuals for adverse action.
 * Manual recommendations may still reference drivers/customers but require human review downstream.
 */
export function assertNoProtectedAutomatedDiscrimination(
  sourceType: RecommendationSourceType,
  affectedEntities: RecommendationAffectedEntity[],
): void {
  if (sourceType === 'MANUAL') return;
  const hasProtectedTarget = affectedEntities.some((e) =>
    PROTECTED_AUTOMATION_ENTITY_TYPES.has(e.entityType),
  );
  if (hasProtectedTarget) {
    throw new BadRequestException({
      message:
        'Automated recommendations cannot target driver or customer entities for adverse operational action',
      code: 'RECOMMENDATION_PROTECTED_ENTITY_BLOCKED',
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertRecommendationStatusTransition,
  buildRecommendationDedupKey,
  deriveExpectedNetBenefit,
  normalizeAffectedEntities,
  normalizeRecommendationMoney,
  validateCreateRecommendationInput,
  validateUpdateRecommendationInput,
} from '@shared/recommendations/recommendation-domain.logic';
import {
  CreateRecommendationInput,
  RECOMMENDATION_CALCULATION_VERSION,
  RecommendationRecord,
  RecommendationStatus,
  UpdateRecommendationInput,
} from '@shared/recommendations/recommendation-domain.types';
import { OrgRecommendationsRepository } from './org-recommendations.repository';
import { ListRecommendationsFilter } from './org-recommendations.repository';

@Injectable()
export class OrgRecommendationsService {
  constructor(private readonly repo: OrgRecommendationsRepository) {}

  async list(organizationId: string, filter: ListRecommendationsFilter = {}) {
    return this.repo.list(organizationId, filter);
  }

  async getById(organizationId: string, id: string) {
    const row = await this.repo.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException({
        message: 'Recommendation not found',
        code: 'RECOMMENDATION_NOT_FOUND',
      });
    }
    return row;
  }

  async getEvents(organizationId: string, id: string) {
    await this.getById(organizationId, id);
    return this.repo.listEvents(organizationId, id);
  }

  async create(
    organizationId: string,
    input: CreateRecommendationInput,
    actorUserId?: string | null,
  ): Promise<RecommendationRecord> {
    const payload: CreateRecommendationInput = {
      ...input,
      organizationId,
      affectedEntities: normalizeAffectedEntities(input.affectedEntities),
    };
    validateCreateRecommendationInput(payload);

    const sourceExists = await this.repo.assertSourceExists(
      organizationId,
      payload.sourceType,
      payload.sourceId,
    );
    if (!sourceExists) {
      throw new BadRequestException({
        message: 'Recommendation source not found for organization',
        code: 'RECOMMENDATION_SOURCE_NOT_FOUND',
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
      });
    }

    const expectedBenefit = normalizeRecommendationMoney(
      'expectedBenefit',
      payload.expectedBenefit,
    );
    const estimatedCost = normalizeRecommendationMoney('estimatedCost', payload.estimatedCost);
    const netBenefit = normalizeRecommendationMoney(
      'expectedNetBenefit',
      deriveExpectedNetBenefit(
        payload.expectedBenefit,
        payload.estimatedCost,
        payload.expectedNetBenefit,
      ),
    );

    const dedupKey = buildRecommendationDedupKey({
      organizationId,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      category: payload.category,
      title: payload.title,
      affectedEntities: payload.affectedEntities ?? [],
    });

    const existing = await this.repo.findByDedupKey(organizationId, dedupKey);
    if (existing) {
      return this.repo.updateWithEvent(
        organizationId,
        existing.id,
        {
          description: payload.description.trim(),
          rationale: payload.rationale.trim(),
          expectedBenefitCents: expectedBenefit?.cents ?? null,
          expectedBenefitCurrency: expectedBenefit?.currency ?? null,
          estimatedCostCents: estimatedCost?.cents ?? null,
          estimatedCostCurrency: estimatedCost?.currency ?? null,
          expectedNetBenefitCents: netBenefit?.cents ?? null,
          expectedNetBenefitCurrency: netBenefit?.currency ?? null,
          confidence: payload.confidence,
          priority: payload.priority ?? existing.priority,
          affectedEntities: (payload.affectedEntities ?? []) as unknown as Prisma.InputJsonValue,
          calculationVersion:
            payload.calculationVersion ?? RECOMMENDATION_CALCULATION_VERSION,
        },
        {
          eventType: 'DEDUPLICATED',
          actorUserId,
          previousStatus: existing.status,
          newStatus: existing.status,
          metadata: { dedupKey },
        },
      ) as Promise<RecommendationRecord>;
    }

    return this.repo.createWithEvent(
      {
        organization: { connect: { id: organizationId } },
        sourceType: payload.sourceType,
        sourceId: payload.sourceId.trim(),
        category: payload.category,
        title: payload.title.trim(),
        description: payload.description.trim(),
        rationale: payload.rationale.trim(),
        expectedBenefitCents: expectedBenefit?.cents ?? null,
        expectedBenefitCurrency: expectedBenefit?.currency ?? null,
        estimatedCostCents: estimatedCost?.cents ?? null,
        estimatedCostCurrency: estimatedCost?.currency ?? null,
        expectedNetBenefitCents: netBenefit?.cents ?? null,
        expectedNetBenefitCurrency: netBenefit?.currency ?? null,
        confidence: payload.confidence,
        priority: payload.priority ?? 0,
        affectedEntities: (payload.affectedEntities ?? []) as unknown as Prisma.InputJsonValue,
        ownerId: payload.ownerId ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        dedupKey,
        calculationVersion:
          payload.calculationVersion ?? RECOMMENDATION_CALCULATION_VERSION,
      },
      {
        eventType: 'CREATED',
        actorUserId,
        metadata: { dedupKey, sourceType: payload.sourceType, sourceId: payload.sourceId },
      },
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateRecommendationInput,
    actorUserId?: string | null,
  ): Promise<RecommendationRecord> {
    const existing = await this.getById(organizationId, id);
    validateUpdateRecommendationInput(input);

    const expectedBenefit =
      input.expectedBenefit !== undefined
        ? normalizeRecommendationMoney('expectedBenefit', input.expectedBenefit)
        : existing.expectedBenefit
          ? {
              cents: existing.expectedBenefit.amountMinor,
              currency: existing.expectedBenefit.currency,
            }
          : null;
    const estimatedCost =
      input.estimatedCost !== undefined
        ? normalizeRecommendationMoney('estimatedCost', input.estimatedCost)
        : existing.estimatedCost
          ? { cents: existing.estimatedCost.amountMinor, currency: existing.estimatedCost.currency }
          : null;
    const netBenefit =
      input.expectedNetBenefit !== undefined ||
      input.expectedBenefit !== undefined ||
      input.estimatedCost !== undefined
        ? normalizeRecommendationMoney(
            'expectedNetBenefit',
            deriveExpectedNetBenefit(
              expectedBenefit
                ? { amountMinor: expectedBenefit.cents, currency: expectedBenefit.currency }
                : null,
              estimatedCost
                ? { amountMinor: estimatedCost.cents, currency: estimatedCost.currency }
                : null,
              input.expectedNetBenefit,
            ),
          )
        : existing.expectedNetBenefit
          ? {
              cents: existing.expectedNetBenefit.amountMinor,
              currency: existing.expectedNetBenefit.currency,
            }
          : null;

    const updated = await this.repo.updateWithEvent(
      organizationId,
      id,
      {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.rationale !== undefined ? { rationale: input.rationale.trim() } : {}),
        ...(input.expectedBenefit !== undefined ||
        input.estimatedCost !== undefined ||
        input.expectedNetBenefit !== undefined
          ? {
              expectedBenefitCents: expectedBenefit?.cents ?? null,
              expectedBenefitCurrency: expectedBenefit?.currency ?? null,
              estimatedCostCents: estimatedCost?.cents ?? null,
              estimatedCostCurrency: estimatedCost?.currency ?? null,
              expectedNetBenefitCents: netBenefit?.cents ?? null,
              expectedNetBenefitCurrency: netBenefit?.currency ?? null,
            }
          : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.affectedEntities !== undefined
          ? {
              affectedEntities: normalizeAffectedEntities(
                input.affectedEntities,
              ) as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
      },
      {
        eventType: input.ownerId !== undefined ? 'OWNER_ASSIGNED' : 'UPDATED',
        actorUserId,
        previousStatus: existing.status,
        newStatus: existing.status,
      },
    );

    if (!updated) {
      throw new NotFoundException({
        message: 'Recommendation not found',
        code: 'RECOMMENDATION_NOT_FOUND',
      });
    }
    return updated;
  }

  async transitionStatus(
    organizationId: string,
    id: string,
    status: RecommendationStatus,
    actorUserId?: string | null,
    reason?: string | null,
  ): Promise<RecommendationRecord> {
    const existing = await this.getById(organizationId, id);
    assertRecommendationStatusTransition(existing.status, status);

    const metadata =
      status === 'REJECTED' && reason?.trim()
        ? { rejectionReason: reason.trim() }
        : undefined;

    const updated = await this.repo.updateWithEvent(
      organizationId,
      id,
      { status },
      {
        eventType: 'STATUS_CHANGED',
        actorUserId,
        previousStatus: existing.status,
        newStatus: status,
        metadata,
      },
    );

    if (!updated) {
      throw new NotFoundException({
        message: 'Recommendation not found',
        code: 'RECOMMENDATION_NOT_FOUND',
      });
    }
    return updated;
  }
}

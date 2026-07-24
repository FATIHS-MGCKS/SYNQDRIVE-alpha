import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskPriority, TaskSource, TaskType, Prisma } from '@prisma/client';
import {
  buildRecommendationTaskDedupKey,
  buildRecommendationTaskMetadata,
  buildRecommendationWorkflowIdempotencyKey,
  findRecommendationEntity,
  listRecommendationIntegrationActions,
  mapRecommendationCategoryToServiceCaseCategory,
  mapRecommendationPriorityToTaskPriority,
  normalizeRecommendationEntities,
  RECOMMENDATION_WORKFLOW_EVENT_TYPE,
  resolveWorkflowActionKey,
  type EvaluationsRecommendationIntegrationAction,
} from '@synq/evaluations-insights/evaluations-recommendation-integrations';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { ServiceCasesService } from '@modules/service-cases/service-cases.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrgRecommendationsRepository } from './org-recommendations.repository';
import { RecommendationEntityValidationService } from './recommendation-entity-validation.service';

export interface ExecuteRecommendationIntegrationInput {
  action: EvaluationsRecommendationIntegrationAction;
  entityId?: string;
  ownerId?: string;
  dueAt?: string;
}

@Injectable()
export class RecommendationIntegrationsService {
  constructor(
    private readonly repo: OrgRecommendationsRepository,
    private readonly entityValidation: RecommendationEntityValidationService,
    private readonly tasks: TasksService,
    private readonly serviceCases: ServiceCasesService,
    private readonly workflows: WorkflowEventService,
    private readonly prisma: PrismaService,
  ) {}

  async listIntegrations(organizationId: string, recommendationId: string, canManage: boolean) {
    const recommendation = await this.requireRecommendation(organizationId, recommendationId);
    this.entityValidation.assertSameOrganization(organizationId, recommendation.organizationId);

    const linkedTaskId = await this.findLinkedTaskId(organizationId, recommendationId, 'task');
    const linkedReminderTaskId = await this.findLinkedTaskId(
      organizationId,
      recommendationId,
      'reminder',
    );
    const linkedServiceCaseId = await this.findLinkedServiceCaseId(organizationId, recommendationId);

    return listRecommendationIntegrationActions(recommendation, {
      canManage,
      linkedTaskId,
      linkedReminderTaskId,
      linkedServiceCaseId,
    });
  }

  async executeIntegration(
    organizationId: string,
    recommendationId: string,
    input: ExecuteRecommendationIntegrationInput,
    actorUserId?: string | null,
    canManage = true,
  ) {
    if (!canManage) {
      throw new ForbiddenException({
        message: 'Insufficient permissions for recommendation integrations',
        code: 'RECOMMENDATION_INTEGRATION_FORBIDDEN',
      });
    }

    const recommendation = await this.requireRecommendation(organizationId, recommendationId);
    this.entityValidation.assertSameOrganization(organizationId, recommendation.organizationId);
    await this.entityValidation.assertRecommendationEntitiesInOrg(
      organizationId,
      recommendation.affectedEntities,
    );

    switch (input.action) {
      case 'CREATE_TASK':
        return this.createTaskFromRecommendation(organizationId, recommendation, 'task', actorUserId);
      case 'CREATE_REMINDER':
        return this.createTaskFromRecommendation(
          organizationId,
          recommendation,
          'reminder',
          actorUserId,
          input.dueAt ?? recommendation.dueAt ?? undefined,
        );
      case 'OPEN_SERVICE_CASE':
        return this.createServiceCaseFromRecommendation(organizationId, recommendation, actorUserId);
      case 'START_WORKFLOW':
        return this.startWorkflowFromRecommendation(organizationId, recommendation);
      case 'ASSIGN_OWNER':
        if (!input.ownerId?.trim()) {
          throw new BadRequestException({
            message: 'ownerId is required',
            code: 'RECOMMENDATION_OWNER_REQUIRED',
          });
        }
        return this.assignOwner(organizationId, recommendationId, input.ownerId.trim(), actorUserId);
      default:
        throw new BadRequestException({
          message: 'Action must be executed on the client',
          code: 'RECOMMENDATION_INTEGRATION_NAVIGATE_ONLY',
          action: input.action,
        });
    }
  }

  private async requireRecommendation(organizationId: string, recommendationId: string) {
    const recommendation = await this.repo.findById(organizationId, recommendationId);
    if (!recommendation) {
      throw new NotFoundException({
        message: 'Recommendation not found',
        code: 'RECOMMENDATION_NOT_FOUND',
      });
    }
    return recommendation;
  }

  private async findLinkedTaskId(
    organizationId: string,
    recommendationId: string,
    variant: 'task' | 'reminder',
  ): Promise<string | null> {
    const dedupKey = buildRecommendationTaskDedupKey(recommendationId, variant);
    const active = await this.tasks.findActiveByDedup(organizationId, dedupKey);
    return active?.id ?? null;
  }

  private async findLinkedServiceCaseId(
    organizationId: string,
    recommendationId: string,
  ): Promise<string | null> {
    const row = await this.prisma.serviceCase.findFirst({
      where: {
        organizationId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        metadata: {
          path: ['recommendationId'],
          equals: recommendationId,
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return row?.id ?? null;
  }

  private async createTaskFromRecommendation(
    organizationId: string,
    recommendation: Awaited<ReturnType<OrgRecommendationsRepository['findById']>> & object,
    variant: 'task' | 'reminder',
    actorUserId?: string | null,
    dueAt?: string,
  ) {
    const dedupKey = buildRecommendationTaskDedupKey(recommendation.id, variant);
    const existing = await this.tasks.findActiveByDedup(organizationId, dedupKey);
    if (existing) {
      throw new ConflictException({
        message: 'Linked task already exists for this recommendation',
        code: 'RECOMMENDATION_TASK_DUPLICATE',
        taskId: existing.id,
      });
    }

    const vehicle = findRecommendationEntity(recommendation.affectedEntities, 'vehicle');
    const booking = findRecommendationEntity(recommendation.affectedEntities, 'booking');
    const customer = findRecommendationEntity(recommendation.affectedEntities, 'customer');
    const invoice = findRecommendationEntity(recommendation.affectedEntities, 'invoice');

    const priority = mapRecommendationPriorityToTaskPriority(recommendation.priority) as TaskPriority;
    const title =
      variant === 'reminder'
        ? `Follow-up: ${recommendation.title}`
        : recommendation.title;
    const description = [
      recommendation.description,
      '',
      `Ursache: ${recommendation.rationale}`,
      `Quelle: ${recommendation.sourceType} / ${recommendation.sourceId}`,
      `Empfehlung: ${recommendation.id}`,
    ].join('\n');

    const task = await this.tasks.upsertByDedup(organizationId, dedupKey, {
      title,
      description,
      category: 'EVALUATIONS',
      type: variant === 'reminder' ? TaskType.CUSTOM : TaskType.CUSTOM,
      sourceType: TaskSource.SYSTEM,
      priority,
      vehicleId: vehicle?.entityId ?? null,
      bookingId: booking?.entityId ?? null,
      customerId: customer?.entityId ?? null,
      invoiceId: invoice?.entityId ?? null,
      source: 'evaluations-recommendation',
      dueDate: dueAt ? new Date(dueAt) : recommendation.dueAt ? new Date(recommendation.dueAt) : null,
      metadata: buildRecommendationTaskMetadata(recommendation, {
        integrationVariant: variant,
        createdByUserId: actorUserId ?? null,
      }) as Prisma.InputJsonValue,
    });

    await this.repo.updateWithEvent(
      organizationId,
      recommendation.id,
      {},
      {
        eventType: variant === 'reminder' ? 'REMINDER_LINKED' : 'TASK_LINKED',
        actorUserId,
        previousStatus: recommendation.status,
        newStatus: recommendation.status,
        metadata: {
          taskId: task.id,
          dedupKey,
          variant,
        },
      },
    );

    return {
      action: variant === 'reminder' ? 'CREATE_REMINDER' : 'CREATE_TASK',
      taskId: task.id,
      duplicate: false,
    };
  }

  private async createServiceCaseFromRecommendation(
    organizationId: string,
    recommendation: Awaited<ReturnType<OrgRecommendationsRepository['findById']>> & object,
    actorUserId?: string | null,
  ) {
    const existingId = await this.findLinkedServiceCaseId(organizationId, recommendation.id);
    if (existingId) {
      throw new ConflictException({
        message: 'Linked service case already exists for this recommendation',
        code: 'RECOMMENDATION_SERVICE_CASE_DUPLICATE',
        serviceCaseId: existingId,
      });
    }

    const vehicle = findRecommendationEntity(recommendation.affectedEntities, 'vehicle');
    if (!vehicle) {
      throw new BadRequestException({
        message: 'Vehicle entity is required to open a service case',
        code: 'RECOMMENDATION_VEHICLE_REQUIRED',
      });
    }

    const serviceCase = await this.serviceCases.create(
      organizationId,
      {
        title: recommendation.title,
        description: `${recommendation.description}\n\n${recommendation.rationale}`,
        category: mapRecommendationCategoryToServiceCaseCategory(recommendation.category),
        priority: mapRecommendationPriorityToTaskPriority(recommendation.priority) as TaskPriority,
        source: 'HEALTH',
        vehicleId: vehicle.entityId,
        metadata: buildRecommendationTaskMetadata(recommendation, {
          createdByUserId: actorUserId ?? null,
        }) as Record<string, unknown>,
      },
      actorUserId ?? undefined,
    );

    await this.repo.updateWithEvent(
      organizationId,
      recommendation.id,
      {},
      {
        eventType: 'SERVICE_CASE_LINKED',
        actorUserId,
        previousStatus: recommendation.status,
        newStatus: recommendation.status,
        metadata: {
          serviceCaseId: serviceCase.id,
          vehicleId: vehicle.entityId,
        },
      },
    );

    return {
      action: 'OPEN_SERVICE_CASE',
      serviceCaseId: serviceCase.id,
      vehicleId: vehicle.entityId,
      duplicate: false,
    };
  }

  private async startWorkflowFromRecommendation(
    organizationId: string,
    recommendation: Awaited<ReturnType<OrgRecommendationsRepository['findById']>> & object,
  ) {
    const workflowAction = resolveWorkflowActionKey(recommendation.category);
    if (!workflowAction) {
      throw new BadRequestException({
        message: 'No workflow mapping for recommendation category',
        code: 'RECOMMENDATION_WORKFLOW_UNAVAILABLE',
      });
    }

    const entities = normalizeRecommendationEntities(recommendation.affectedEntities);
    const primary = entities[0];

    const runIds = await this.workflows.emitEvent({
      organizationId,
      type: RECOMMENDATION_WORKFLOW_EVENT_TYPE,
      entityType: 'recommendation',
      entityId: recommendation.id,
      idempotencyKey: buildRecommendationWorkflowIdempotencyKey(recommendation.id),
      payload: {
        recommendationId: recommendation.id,
        category: recommendation.category,
        sourceType: recommendation.sourceType,
        sourceId: recommendation.sourceId,
        workflowAction,
        affectedEntities: entities,
        primaryEntityType: primary?.entityType ?? null,
        primaryEntityId: primary?.entityId ?? null,
      },
    });

    await this.repo.updateWithEvent(
      organizationId,
      recommendation.id,
      {},
      {
        eventType: 'WORKFLOW_STARTED',
        previousStatus: recommendation.status,
        newStatus: recommendation.status,
        metadata: {
          workflowAction,
          workflowRunIds: runIds,
        },
      },
    );

    return {
      action: 'START_WORKFLOW',
      workflowAction,
      workflowRunIds: runIds,
      cancelled: runIds.length === 0,
    };
  }

  private async assignOwner(
    organizationId: string,
    recommendationId: string,
    ownerId: string,
    actorUserId?: string | null,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId: ownerId },
      select: { userId: true },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Owner is not a member of this organization',
        code: 'RECOMMENDATION_OWNER_NOT_FOUND',
      });
    }

    const updated = await this.repo.updateWithEvent(
      organizationId,
      recommendationId,
      { ownerId },
      {
        eventType: 'OWNER_ASSIGNED',
        actorUserId,
        metadata: { ownerId },
      },
    );

    return {
      action: 'ASSIGN_OWNER',
      ownerId,
      recommendation: updated,
    };
  }
}

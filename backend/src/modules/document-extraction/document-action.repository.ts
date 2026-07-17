import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentAction, DocumentActionRequirement, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDocumentActionIdempotencyKey } from './document-action.idempotency';
import { sanitizeDocumentActionPayload } from './document-action.payload';
import type {
  CreatePlannedDocumentActionsInput,
  CreatePlannedDocumentActionsResult,
  PlannedDocumentActionInput,
} from './document-action.types';

@Injectable()
export class DocumentActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertActionPlanInOrg(
    organizationId: string,
    actionPlanId: string,
  ): Promise<{ id: string; extractionId: string; organizationId: string }> {
    const plan = await this.prisma.documentActionPlan.findFirst({
      where: { id: actionPlanId, organizationId },
      select: { id: true, extractionId: true, organizationId: true },
    });
    if (!plan) {
      throw new NotFoundException('Document action plan not found for organization');
    }
    return plan;
  }

  findById(organizationId: string, actionId: string) {
    return this.prisma.documentAction.findFirst({
      where: { id: actionId, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.documentAction.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  listByPlan(organizationId: string, actionPlanId: string) {
    return this.prisma.documentAction.findMany({
      where: { organizationId, actionPlanId },
      orderBy: { sequence: 'asc' },
    });
  }

  listRequiredByPlan(organizationId: string, actionPlanId: string) {
    return this.prisma.documentAction.findMany({
      where: {
        organizationId,
        actionPlanId,
        requirement: { in: ['REQUIRED', 'BLOCKER'] },
      },
      orderBy: { sequence: 'asc' },
    });
  }

  listOptionalByPlan(organizationId: string, actionPlanId: string) {
    return this.prisma.documentAction.findMany({
      where: {
        organizationId,
        actionPlanId,
        requirement: { in: ['OPTIONAL', 'INFORMATIONAL'] },
      },
      orderBy: { sequence: 'asc' },
    });
  }

  /**
   * Persist planned actions for a plan snapshot — no execution side effects.
   */
  async createPlannedActions(
    input: CreatePlannedDocumentActionsInput,
  ): Promise<CreatePlannedDocumentActionsResult> {
    const plan = await this.assertActionPlanInOrg(input.organizationId, input.actionPlanId);
    if (plan.extractionId !== input.extractionId) {
      throw new NotFoundException('Extraction does not match action plan for organization');
    }

    const created: CreatePlannedDocumentActionsResult['created'] = [];
    const deduplicatedKeys: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      let nextSequence =
        (await tx.documentAction.aggregate({
          where: { actionPlanId: input.actionPlanId },
          _max: { sequence: true },
        }))._max.sequence ?? 0;

      for (const action of input.actions) {
        nextSequence += 1;
        const sequence = action.sequence ?? nextSequence;
        const requirement: DocumentActionRequirement = action.requirement ?? 'REQUIRED';
        const idempotencyKey = buildDocumentActionIdempotencyKey({
          organizationId: input.organizationId,
          extractionId: input.extractionId,
          actionPlanId: input.actionPlanId,
          actionType: action.actionType,
          sequence,
          targetEntityType: action.targetEntityType,
          targetEntityId: action.targetEntityId,
        });

        const existing = await tx.documentAction.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey,
            },
          },
        });
        if (existing) {
          deduplicatedKeys.push(idempotencyKey);
          created.push({
            id: existing.id,
            idempotencyKey: existing.idempotencyKey,
            actionType: existing.actionType,
            requirement: existing.requirement,
            status: existing.status,
            sequence: existing.sequence,
          });
          continue;
        }

        const row = await tx.documentAction.create({
          data: this.toCreateData(input, action, sequence, requirement, idempotencyKey),
        });
        created.push({
          id: row.id,
          idempotencyKey: row.idempotencyKey,
          actionType: row.actionType,
          requirement: row.requirement,
          status: row.status,
          sequence: row.sequence,
        });
      }
    });

    return { created, deduplicatedKeys };
  }

  private toCreateData(
    input: CreatePlannedDocumentActionsInput,
    action: PlannedDocumentActionInput,
    sequence: number,
    requirement: DocumentActionRequirement,
    idempotencyKey: string,
  ): Prisma.DocumentActionCreateInput {
    const inputPayload = sanitizeDocumentActionPayload(action.inputPayload) as Prisma.InputJsonValue;
    const previewPayload =
      action.previewPayload == null
        ? undefined
        : (sanitizeDocumentActionPayload(action.previewPayload) as Prisma.InputJsonValue);

    return {
      organization: { connect: { id: input.organizationId } },
      extraction: { connect: { id: input.extractionId } },
      actionPlan: { connect: { id: input.actionPlanId } },
      sequence,
      actionType: action.actionType,
      status: 'WOULD_APPLY',
      requirement,
      targetEntityType: action.targetEntityType ?? undefined,
      targetEntityId: action.targetEntityId ?? undefined,
      idempotencyKey,
      inputPayload,
      previewPayload,
      attempts: 0,
    };
  }

  assertTenantOwnership(action: Pick<DocumentAction, 'organizationId'>, organizationId: string): void {
    if (action.organizationId !== organizationId) {
      throw new NotFoundException('Document action not found for organization');
    }
  }

  async createPlannedActionOrThrowOnConflict(
    input: CreatePlannedDocumentActionsInput,
    action: PlannedDocumentActionInput,
    sequence: number,
  ): Promise<DocumentAction> {
    const plan = await this.assertActionPlanInOrg(input.organizationId, input.actionPlanId);
    if (plan.extractionId !== input.extractionId) {
      throw new NotFoundException('Extraction does not match action plan for organization');
    }

    const requirement: DocumentActionRequirement = action.requirement ?? 'REQUIRED';
    const idempotencyKey = buildDocumentActionIdempotencyKey({
      organizationId: input.organizationId,
      extractionId: input.extractionId,
      actionPlanId: input.actionPlanId,
      actionType: action.actionType,
      sequence,
      targetEntityType: action.targetEntityType,
      targetEntityId: action.targetEntityId,
    });

    const existing = await this.findByIdempotencyKey(input.organizationId, idempotencyKey);
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.documentAction.create({
        data: this.toCreateData(input, action, sequence, requirement, idempotencyKey),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Document action idempotency key already exists');
      }
      throw error;
    }
  }
}

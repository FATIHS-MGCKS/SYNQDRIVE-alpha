import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildWorkflowActionIdempotencyKey } from '../../idempotency';
import { WorkflowActionRunRuntimeRepository } from '../workflow-action-run-runtime.repository';
import { isActionCompensatable } from './workflow-action-error-strategy.constants';

type FallbackActionDef = {
  actionKey: string;
  actionIndex: number;
  actionType: string;
  config?: Record<string, unknown>;
  requiresApproval?: boolean;
  errorStrategy?: string;
  fallbackActionKey?: string | null;
  compensateActionKey?: string | null;
  compensatable?: boolean;
  id?: string;
};

@Injectable()
export class WorkflowActionFallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
  ) {}

  private get maxFallbackDepth() {
    return this.config.get<number>('workflowRuntime.maxFallbackDepth', 3);
  }

  resolveFallbackActionFromSnapshot(
    definitionSnapshot: unknown,
    fallbackActionKey: string,
  ): FallbackActionDef | null {
    if (!definitionSnapshot || typeof definitionSnapshot !== 'object') return null;
    const actions = (definitionSnapshot as { actions?: unknown[] }).actions;
    if (!Array.isArray(actions)) return null;
    const match = actions.find(
      (a) =>
        a &&
        typeof a === 'object' &&
        (a as { actionKey?: string }).actionKey === fallbackActionKey,
    );
    return match && typeof match === 'object' ? (match as FallbackActionDef) : null;
  }

  async materializeFallbackRun(input: {
    organizationId: string;
    workflowRunId: string;
    workflowDefinitionId: string;
    workflowVersionId: string;
    parentActionRunId: string;
    parentActionIndex: number;
    fallbackDepth: number;
    fallbackAction: FallbackActionDef;
    runIdempotencyKey: string;
    occurrenceId?: string | null;
  }) {
    if (input.fallbackDepth >= this.maxFallbackDepth) {
      throw new BadRequestException('Maximum fallback depth exceeded');
    }

    const fallbackIndex = input.parentActionIndex + 1;
    const occurrenceId = input.occurrenceId ?? input.runIdempotencyKey.split(':').slice(-1)[0] ?? input.parentActionRunId;
    const idempotencyKey = buildWorkflowActionIdempotencyKey({
      organizationId: input.organizationId,
      workflowVersionId: input.workflowVersionId,
      actionStableId: input.fallbackAction.actionKey,
      occurrenceId: `${occurrenceId}:fallback:${input.parentActionRunId}`,
    });

    try {
      const inputSnapshot = {
      actionKey: input.fallbackAction.actionKey,
      actionIndex: fallbackIndex,
      actionType: input.fallbackAction.actionType,
      workflowActionId: input.fallbackAction.id ?? null,
      config: input.fallbackAction.config ?? {},
      isFallbackRun: true,
      parentActionRunId: input.parentActionRunId,
    };

    return this.prisma.workflowActionRun.create({
      data: {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        workflowDefinitionId: input.workflowDefinitionId,
        workflowVersionId: input.workflowVersionId,
        workflowActionId: input.fallbackAction.id ?? null,
        actionKey: input.fallbackAction.actionKey,
        actionIndex: fallbackIndex,
        actionType: input.fallbackAction.actionType,
        status: 'PENDING',
        requiresApproval: input.fallbackAction.requiresApproval ?? false,
        blockingOnFailure: false,
        errorStrategy: (input.fallbackAction.errorStrategy as never) ?? 'STOP_WORKFLOW',
        fallbackActionKey: input.fallbackAction.fallbackActionKey ?? null,
        compensateActionKey: input.fallbackAction.compensateActionKey ?? null,
        compensatable: isActionCompensatable(
          input.fallbackAction.actionType,
          input.fallbackAction.compensatable ?? false,
        ),
        parentActionRunId: input.parentActionRunId,
        isFallbackRun: true,
        fallbackDepth: input.fallbackDepth + 1,
        maxAttempts: 5,
        idempotencyKey,
        occurrenceId: `${occurrenceId}:fallback:${input.parentActionRunId}`,
        actionStableId: input.fallbackAction.actionKey,
        providerIdempotencyKey: idempotencyKey,
        input: (input.fallbackAction.config ?? {}) as Prisma.InputJsonValue,
        inputSnapshot: inputSnapshot as Prisma.InputJsonValue,
      },
    });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.workflowActionRun.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }
}

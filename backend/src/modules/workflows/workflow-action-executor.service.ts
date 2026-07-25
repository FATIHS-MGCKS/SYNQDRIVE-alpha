import { Injectable } from '@nestjs/common';
import { WorkflowActionRunStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowActionDef } from './workflow-definition.validator';
import { WORKFLOW_APPROVAL_GATE_ACTIONS } from './workflow.constants';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
  type WorkflowActionExecutionContext,
} from './actions';

export interface ActionExecutionContext {
  organizationId: string;
  workflowId: string;
  workflowRunId: string;
  actionRunId: string;
  actionIndex: number;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

@Injectable()
export class WorkflowActionExecutorService {
  constructor(
    private readonly registryExecutor: WorkflowActionRegistryExecutorService,
    private readonly secretsResolver: WorkflowActionNoopSecretsResolver,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<{ status: WorkflowActionRunStatus; output?: Record<string, unknown>; errorMessage?: string }> {
    if (action.requiresApproval && !WORKFLOW_APPROVAL_GATE_ACTIONS.has(action.type)) {
      await this.prisma.orgWorkflowApproval.create({
        data: {
          organizationId: ctx.organizationId,
          workflowRunId: ctx.workflowRunId,
          actionRunId: ctx.actionRunId,
          status: 'PENDING',
          requestedBySystem: true,
          reason: `Approval required for ${action.type}`,
        },
      });
      return {
        status: 'WAITING_APPROVAL',
        output: { message: 'Awaiting approval before execution' },
      };
    }

    const result = await this.registryExecutor.execute(
      action.type,
      action.config ?? {},
      this.toRegistryContext(ctx),
    );
    return {
      status: this.registryExecutor.toLegacyStatus(result),
      output: result.output,
      errorMessage: result.errorMessage,
    };
  }

  async preview(action: WorkflowActionDef, ctx: ActionExecutionContext) {
    return this.registryExecutor.preview(
      action.type,
      action.config ?? {},
      this.toRegistryContext(ctx),
    );
  }

  validateConfig(action: WorkflowActionDef, ctx: ActionExecutionContext) {
    return this.registryExecutor.validateConfig(
      action.type,
      action.config ?? {},
      this.toRegistryContext(ctx),
    );
  }

  private toRegistryContext(ctx: ActionExecutionContext): WorkflowActionExecutionContext {
    return {
      organizationId: ctx.organizationId,
      workflowRunId: ctx.workflowRunId,
      actionRunId: ctx.actionRunId,
      workflowId: ctx.workflowId,
      actionIndex: ctx.actionIndex,
      idempotencyKey: ctx.idempotencyKey,
      event: {
        eventType: ctx.eventType,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        payload: ctx.payload,
        correlationId: ctx.idempotencyKey,
      },
      workflowSnapshot: {},
      policySnapshot: {},
      actor: {
        kind: 'system',
        permissions: ['WORKFLOW_EXECUTE', 'WORKFLOW_VEHICLE_WRITE', 'WORKFLOW_AI_SUGGEST'],
      },
      correlationId: ctx.idempotencyKey,
      secretsResolver: this.secretsResolver,
      logger: createWorkflowActionPiiSafeLogger(`workflow-action:${ctx.actionRunId}`),
    };
  }
}

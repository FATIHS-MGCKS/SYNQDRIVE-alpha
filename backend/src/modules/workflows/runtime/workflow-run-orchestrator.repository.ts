import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowConditionDef } from '../workflow-definition.validator';
import { evaluateWorkflowConditions } from '../workflow-condition.evaluator';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowMatcherMatchedWorkflow } from '../matcher/workflow-matcher.types';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

const VERSION_GRAPH_INCLUDE = {
  definition: true,
  trigger: true,
  scope: { include: { bindings: true } },
  conditionGroups: { include: { conditions: true } },
  actions: { orderBy: { actionIndex: 'asc' as const } },
} satisfies Prisma.WorkflowVersionInclude;

export type WorkflowVersionGraph = Prisma.WorkflowVersionGetPayload<{
  include: typeof VERSION_GRAPH_INCLUDE;
}>;

export interface CreateWorkflowRunInput {
  organizationId: string;
  match: WorkflowMatcherMatchedWorkflow;
  envelope: WorkflowDomainEventEnvelope;
  idempotencyKey: string;
}

@Injectable()
export class WorkflowRunOrchestratorRepository {
  constructor(private readonly prisma: PrismaService) {}

  findExistingRun(orgId: string, idempotencyKey: string) {
    return this.prisma.workflowRun.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId: orgId, idempotencyKey },
      },
      include: { actionRuns: { orderBy: { actionIndex: 'asc' } } },
    });
  }

  loadVersionGraph(orgId: string, versionId: string): Promise<WorkflowVersionGraph | null> {
    return this.prisma.workflowVersion.findFirst({
      where: { id: versionId, organizationId: orgId },
      include: VERSION_GRAPH_INCLUDE,
    });
  }

  async getOrCreatePolicySnapshot(orgId: string) {
    const policyPayload = {
      capabilityRevision: '1.0.0',
      approvalResumeSupported: false,
      approvalTtlHours: 72,
    };
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ orgId, ...policyPayload }))
      .digest('hex');

    const existing = await this.prisma.workflowPolicySnapshot.findUnique({
      where: {
        organizationId_contentHash: { organizationId: orgId, contentHash },
      },
    });
    if (existing) return existing;

    return this.prisma.workflowPolicySnapshot.create({
      data: {
        organizationId: orgId,
        capabilityRevision: policyPayload.capabilityRevision,
        approvalResumeSupported: policyPayload.approvalResumeSupported,
        approvalTtlHours: policyPayload.approvalTtlHours,
        policyPayload,
        contentHash,
      },
    });
  }

  evaluateVersionConditions(
    version: WorkflowVersionGraph,
    payload: Record<string, unknown>,
  ) {
    const conditions: WorkflowConditionDef[] = version.conditionGroups
      .flatMap((group) => group.conditions)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((condition) => ({
        path: condition.fieldPath,
        operator: condition.operator,
        value:
          condition.valueJson ??
          condition.valueText ??
          condition.valueNumber ??
          condition.valueBoolean,
      }));
    return evaluateWorkflowConditions(conditions, payload);
  }

  async createRunWithActions(
    input: CreateWorkflowRunInput & {
      version: WorkflowVersionGraph;
      policySnapshotId: string;
      conditionResult: unknown;
      skipped: boolean;
    },
  ) {
    const payload =
      input.envelope.payload && typeof input.envelope.payload === 'object'
        ? (input.envelope.payload as Record<string, unknown>)
        : {};

    const definitionSnapshot =
      input.version.definitionSnapshot ??
      ({
        versionId: input.version.id,
        versionNumber: input.version.versionNumber,
        definitionId: input.version.workflowDefinitionId,
        actions: input.version.actions.map((action) => ({
          actionKey: action.actionKey,
          actionIndex: action.actionIndex,
          actionType: action.actionType,
          requiresApproval: action.requiresApproval,
        })),
      } as Prisma.InputJsonValue);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.workflowRun.create({
        data: {
          organizationId: input.organizationId,
          workflowDefinitionId: input.match.workflowDefinitionId,
          workflowVersionId: input.match.workflowVersionId,
          policySnapshotId: input.policySnapshotId,
          versionNumber: input.match.versionNumber,
          eventType: input.envelope.eventType,
          entityType: input.envelope.entityType ?? null,
          entityId: input.envelope.entityId ?? null,
          status: input.skipped ? 'SKIPPED' : 'PENDING',
          idempotencyKey: input.idempotencyKey,
          correlationId: input.envelope.correlationId,
          inputPayload: payload as Prisma.InputJsonValue,
          definitionSnapshot: definitionSnapshot as Prisma.InputJsonValue,
          conditionResult: input.conditionResult as Prisma.InputJsonValue,
          finishedAt: input.skipped ? new Date() : null,
        },
      });

      await tx.workflowRuntimeStatusTransition.create({
        data: {
          organizationId: input.organizationId,
          entityType: 'RUN',
          workflowRunId: run.id,
          fromStatus: 'PENDING',
          toStatus: input.skipped ? 'SKIPPED' : 'PENDING',
          actorType: 'SYSTEM',
          actorSource: 'orchestrator.create',
          reason: input.skipped ? 'Conditions not met' : 'Run created',
        },
      });

      const snapshotPayload = {
        runId: run.id,
        eventId: input.envelope.eventId,
        correlationId: input.envelope.correlationId,
        versionId: input.version.id,
        capturedAt: new Date().toISOString(),
      };
      const contentHash = createHash('sha256')
        .update(JSON.stringify(snapshotPayload))
        .digest('hex');

      await tx.workflowExecutionSnapshot.create({
        data: {
          organizationId: input.organizationId,
          workflowRunId: run.id,
          contentHash,
          payload: snapshotPayload,
        },
      });

      if (!input.skipped) {
        for (const action of input.version.actions) {
          const actionIdempotencyKey = `${input.idempotencyKey}:action:${action.actionIndex}`;
          const inputSnapshot = {
            actionKey: action.actionKey,
            actionIndex: action.actionIndex,
            actionType: action.actionType,
            workflowActionId: action.id,
            config: action.config ?? {},
          };
          await tx.workflowActionRun.create({
            data: {
              organizationId: input.organizationId,
              workflowRunId: run.id,
              workflowDefinitionId: input.match.workflowDefinitionId,
              workflowVersionId: input.match.workflowVersionId,
              workflowActionId: action.id,
              actionKey: action.actionKey,
              actionIndex: action.actionIndex,
              actionType: action.actionType,
              status: 'PENDING',
              requiresApproval: action.requiresApproval,
              blockingOnFailure: true,
              maxAttempts: 5,
              idempotencyKey: actionIdempotencyKey,
              input: (action.config ?? {}) as Prisma.InputJsonValue,
              inputSnapshot: inputSnapshot as Prisma.InputJsonValue,
            },
          });
        }

        await tx.workflowRun.update({
          where: { id: run.id },
          data: { status: 'RUNNING', lockVersion: { increment: 1 } },
        });

        await tx.workflowRuntimeStatusTransition.create({
          data: {
            organizationId: input.organizationId,
            entityType: 'RUN',
            workflowRunId: run.id,
            fromStatus: 'PENDING',
            toStatus: 'RUNNING',
            actorType: 'SYSTEM',
            actorSource: 'orchestrator.create',
            reason: 'Action runs materialized',
          },
        });
      }

      await tx.workflowDefinition.update({
        where: { id: input.match.workflowDefinitionId },
        data: {
          triggerCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      });

      return tx.workflowRun.findFirstOrThrow({
        where: { id: run.id, organizationId: input.organizationId },
        include: { actionRuns: { orderBy: { actionIndex: 'asc' } } },
      });
    });
  }

  findActiveRuns(orgId: string, limit: number) {
    return this.prisma.workflowRun.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['PENDING', 'RUNNING', 'WAITING', 'WAITING_FOR_APPROVAL'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  assertTenant(run: { organizationId: string }, orgId: string): void {
    if (run.organizationId !== orgId) {
      throw new Error(WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TENANT_VIOLATION);
    }
  }
}

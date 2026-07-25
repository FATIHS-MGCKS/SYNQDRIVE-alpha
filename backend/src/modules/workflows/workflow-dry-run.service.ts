import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgWorkflow } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateWorkflowConditions } from './workflow-condition.evaluator';
import { normalizeTriggerType } from './workflow-definition.validator';
import { WorkflowExecutionMode } from './workflow-execution-mode';
import type {
  WorkflowExecutionPlan,
  WorkflowPlannedAction,
} from './workflow-execution-plan.types';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { evaluateWorkflowScope } from './workflow-scope.evaluator';
import { sanitizePreviewRecord } from './workflow-preview.util';
import { actionRequiresApproval } from './workflow-action-risk';
import { assessWorkflowRiskFromActionTypes } from './workflow-risk.util';
import type { WorkflowDomainEvent } from './workflow-engine.service';

const DRY_RUN_MESSAGE =
  'Dry run completed — no actions were executed, no data was persisted, and no providers were contacted.';

@Injectable()
export class WorkflowDryRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionPreview: WorkflowActionPreviewService,
  ) {}

  async buildExecutionPlan(
    orgId: string,
    workflowId: string,
    dto: {
      payload?: Record<string, unknown>;
      entityType?: string;
      entityId?: string;
      eventType?: string;
      proposedDefinition?: Partial<{
        name: string;
        description?: string | null;
        category: string;
        trigger: unknown;
        conditions: unknown;
        actions: unknown;
        scope: unknown;
        status: string;
        version?: number;
      }>;
      sourceRevisionType?: 'saved' | 'draft';
    },
  ): Promise<WorkflowExecutionPlan> {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');

    const effectiveWorkflow = dto.proposedDefinition
      ? ({
          ...wf,
          ...dto.proposedDefinition,
          trigger: dto.proposedDefinition.trigger ?? wf.trigger,
          conditions: dto.proposedDefinition.conditions ?? wf.conditions,
          actions: dto.proposedDefinition.actions ?? wf.actions,
          scope: dto.proposedDefinition.scope ?? wf.scope,
          version: dto.proposedDefinition.version ?? wf.version,
        } as OrgWorkflow)
      : wf;

    const event = this.buildEvent(orgId, effectiveWorkflow, dto);
    return this.planWorkflow(effectiveWorkflow, event, {
      sourceRevisionType: dto.sourceRevisionType ?? (dto.proposedDefinition ? 'draft' : 'saved'),
    });
  }

  async planWorkflow(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    meta?: { sourceRevisionType?: 'saved' | 'draft'; requestId?: string; correlationId?: string },
  ): Promise<WorkflowExecutionPlan> {
    const scopeDef = workflow.scope as { type?: string };
    const scope = evaluateWorkflowScope(
      workflow.scope as unknown as Parameters<typeof evaluateWorkflowScope>[0],
      event,
    );

    const conditionsRaw = (workflow.conditions as unknown[]) ?? [];
    const conditionEval = evaluateWorkflowConditions(
      conditionsRaw as Parameters<typeof evaluateWorkflowConditions>[0],
      event.payload,
    );

    const conditionResults = conditionEval.results.map((r) => ({
      ...r,
      expected: undefined,
      actual: undefined,
    }));

    const plannedActions: WorkflowPlannedAction[] = [];
    const skippedActions: WorkflowPlannedAction[] = [];
    const validationErrors: string[] = [];
    const policyBlockers: string[] = [];
    let wouldCreateApprovals = false;

    const actions = (workflow.actions as Array<{ type: string; config?: Record<string, unknown>; requiresApproval?: boolean }>) ?? [];

    if (!scope.passed) {
      policyBlockers.push(scope.reason ?? 'Scope check failed (fail-closed)');
      for (let i = 0; i < actions.length; i++) {
        skippedActions.push({
          index: i,
          actionType: actions[i].type,
          riskClass: 'UNKNOWN',
          requiresApproval: false,
          status: 'SKIPPED',
          policyBlockers: [scope.reason ?? 'Scope mismatch'],
          validationErrors: [],
          skipReason: 'Workflow skipped — scope did not match',
        });
      }
    } else if (!conditionEval.passed) {
      policyBlockers.push('One or more conditions did not match');
      for (let i = 0; i < actions.length; i++) {
        skippedActions.push({
          index: i,
          actionType: actions[i].type,
          riskClass: 'UNKNOWN',
          requiresApproval: false,
          status: 'SKIPPED',
          policyBlockers: ['Conditions not satisfied'],
          validationErrors: [],
          skipReason: 'Workflow skipped — conditions failed',
        });
      }
    } else {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const planned = await this.actionPreview.previewAction({
          action: action as Parameters<WorkflowActionPreviewService['previewAction']>[0]['action'],
          index: i,
          ctx: {
            organizationId: event.organizationId,
            payload: event.payload,
            entityType: event.entityType,
            entityId: event.entityId,
            eventType: event.type,
          },
        });

        if (planned.requiresApproval) {
          wouldCreateApprovals = true;
        }
        validationErrors.push(...planned.validationErrors);
        policyBlockers.push(...planned.policyBlockers);

        if (planned.status === 'SKIPPED') {
          skippedActions.push(planned);
        } else {
          plannedActions.push(planned);
        }
      }
    }

    const trigger = workflow.trigger as { type?: string };
    const normalizedEventType = normalizeTriggerType(trigger?.type ?? event.type);
    const actionsForRisk = (workflow.actions as Array<{ type?: string }>) ?? [];
    const requestId = meta?.requestId ?? randomUUID();
    const correlationId = meta?.correlationId ?? requestId;

    return {
      executionMode: WorkflowExecutionMode.DRY_RUN,
      executed: false,
      message: DRY_RUN_MESSAGE,
      requestId,
      correlationId,
      assessedAt: new Date().toISOString(),
      riskClass: assessWorkflowRiskFromActionTypes(actionsForRisk),
      sourceRevision: {
        type: meta?.sourceRevisionType ?? 'saved',
        version: workflow.version,
      },
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      workflowName: workflow.name,
      event: {
        type: normalizedEventType,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        normalizedPayload: sanitizePreviewRecord(event.payload),
      },
      scope,
      conditions: {
        passed: conditionEval.passed,
        results: conditionResults,
      },
      plannedActions,
      skippedActions,
      validationErrors: [...new Set(validationErrors)],
      policyBlockers: [...new Set(policyBlockers)],
      wouldCreateApprovals,
    };
  }

  private buildEvent(
    orgId: string,
    workflow: OrgWorkflow,
    dto: {
      payload?: Record<string, unknown>;
      entityType?: string;
      entityId?: string;
      eventType?: string;
    },
  ): WorkflowDomainEvent {
    const trigger = workflow.trigger as { type?: string };
    const type = dto.eventType ?? normalizeTriggerType(trigger?.type ?? 'manual.test');
    return {
      organizationId: orgId,
      type,
      entityType: dto.entityType,
      entityId: dto.entityId,
      payload: sanitizePreviewRecord({
        ...(dto.payload ?? {}),
        manualTest: true,
        workflowName: workflow.name,
      }),
      occurredAt: new Date(),
      idempotencyKey: `dry-run:${workflow.id}:${Date.now()}`,
    };
  }
}

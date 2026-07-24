import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgWorkflow } from '@prisma/client';
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
import type { WorkflowDomainEvent } from './workflow-engine.service';
import { WorkflowTenantGuardService } from './workflow-tenant-guard.service';
import { extractWorkflowEntityRefs } from './workflow-entity-refs.util';

const DRY_RUN_MESSAGE =
  'Dry run completed — no actions were executed, no data was persisted, and no providers were contacted.';

@Injectable()
export class WorkflowDryRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionPreview: WorkflowActionPreviewService,
    private readonly tenantGuard: WorkflowTenantGuardService,
  ) {}

  async buildExecutionPlan(
    orgId: string,
    workflowId: string,
    dto: {
      payload?: Record<string, unknown>;
      entityType?: string;
      entityId?: string;
      eventType?: string;
    },
  ): Promise<WorkflowExecutionPlan> {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');

    const event = this.buildEvent(orgId, wf, dto);
    const entityError = await this.tenantGuard.tryValidateEntityRefs(
      orgId,
      extractWorkflowEntityRefs(event),
    );
    return this.planWorkflow(wf, event, entityError);
  }

  async planWorkflow(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    entityValidationError: string | null = null,
  ): Promise<WorkflowExecutionPlan> {
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
    const validationErrors: string[] = entityValidationError ? [entityValidationError] : [];
    const policyBlockers: string[] = entityValidationError
      ? ['Referenced entities failed tenant validation']
      : [];
    let wouldCreateApprovals = false;

    const actions = (workflow.actions as Array<{ type: string; config?: Record<string, unknown>; requiresApproval?: boolean }>) ?? [];

    if (entityValidationError) {
      for (let i = 0; i < actions.length; i++) {
        skippedActions.push({
          index: i,
          actionType: actions[i].type,
          riskClass: 'UNKNOWN',
          requiresApproval: false,
          status: 'SKIPPED',
          policyBlockers: ['Entity validation failed'],
          validationErrors: [entityValidationError],
          skipReason: 'Workflow skipped — invalid entity references',
        });
      }
    } else if (!scope.passed) {
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

    return {
      executionMode: WorkflowExecutionMode.DRY_RUN,
      executed: false,
      message: DRY_RUN_MESSAGE,
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

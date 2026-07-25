import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTaskAutomationWorkflowRuntimeMode } from '@config/task-automation-workflow-runtime.config';
import { WorkflowRuntimeRolloutService } from '../rollout/workflow-runtime-rollout.service';
import type { WorkflowRuntimeBridgeExecutionPath } from '../rollout/workflow-runtime-rollout.contract';
import { WorkflowShadowGateService } from '../shadow/workflow-shadow-gate.service';
import { WorkflowShadowService } from '../shadow/workflow-shadow.service';
import type {
  TaskAutomationExecutionRouteInput,
  TaskAutomationShadowResult,
} from './task-automation-workflow-bridge.types';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';

@Injectable()
export class TaskAutomationExecutionRouterService {
  private readonly logger = new Logger(TaskAutomationExecutionRouterService.name);
  private readonly shadowLog: TaskAutomationShadowResult[] = [];

  constructor(
    private readonly materializer: TaskAutomationWorkflowMaterializerService,
    private readonly shadowService: WorkflowShadowService,
    private readonly shadowGate: WorkflowShadowGateService,
    private readonly rollout: WorkflowRuntimeRolloutService,
    private readonly config: ConfigService,
  ) {}

  getMode() {
    return (
      this.config.get<ReturnType<typeof resolveTaskAutomationWorkflowRuntimeMode>>(
        'taskAutomationWorkflowRuntime.mode',
      ) ?? resolveTaskAutomationWorkflowRuntimeMode()
    );
  }

  /** Test-only in-memory drain — production uses persisted shadow tables. */
  drainShadowLog(): TaskAutomationShadowResult[] {
    const copy = [...this.shadowLog];
    this.shadowLog.length = 0;
    return copy;
  }

  async route(input: TaskAutomationExecutionRouteInput): Promise<void> {
    const orgId = input.payload.organizationId;
    const rolloutFlags = await this.rollout.resolveEffectiveFlags(orgId);
    const path = await this.resolveExecutionPath(orgId, rolloutFlags.executionPath);

    if (path === 'blocked') {
      this.logger.warn(
        `Workflow runtime rollout blocked task automation for org=${orgId} catalog=${input.payload.catalogKey}`,
      );
      return;
    }

    if (path === 'legacy_only' || path === 'shadow_compare') {
      await input.legacyExecute();
    }

    if (path === 'shadow_compare') {
      await this.runShadowCompare(input);
      return;
    }

    if (path === 'legacy_only') {
      return;
    }

    if (path === 'workflow_live') {
      await this.materializer.materializeViaWorkflow(input.payload, 'execute');
    }
  }

  private async resolveExecutionPath(
    organizationId: string,
    rolloutPath: WorkflowRuntimeBridgeExecutionPath,
  ): Promise<WorkflowRuntimeBridgeExecutionPath> {
    if (rolloutPath !== 'legacy_only') {
      return rolloutPath;
    }

    const flags = await this.rollout.resolveEffectiveFlags(organizationId);
    if (flags.effectiveStage !== 'DISABLED' || flags.globalStage !== 'DISABLED') {
      return rolloutPath;
    }

    const legacyMode = this.getMode();
    if (legacyMode === 'shadow') return 'shadow_compare';
    if (legacyMode === 'cutover') return 'workflow_live';
    return 'legacy_only';
  }

  private async runShadowCompare(input: TaskAutomationExecutionRouteInput): Promise<void> {
    const orgId = input.payload.organizationId;
    const orgShadowOn = await this.shadowGate.isOrgShadowEnabled(orgId);
    if (!orgShadowOn) {
      this.logger.debug(
        `Shadow compare active but org ${orgId} shadow pilot disabled — skipping workflow evaluation`,
      );
      return;
    }

    const legacy = await this.shadowService.legacySnapshotFromDedup(orgId, input.payload.dedupKey);

    const { shadow, plan } = await this.materializer.materializeViaWorkflow(
      input.payload,
      'preview',
    );

    if (!shadow || !plan) return;

    this.shadowLog.push(shadow);
    this.logger.debug(
      `Shadow workflow preview for ${input.payload.catalogKey} dedup=${input.payload.dedupKey}: ${shadow.previewSummary}`,
    );

    const event = {
      organizationId: orgId,
      type: input.payload.eventType ?? 'task.automation.materialize',
      entityType: input.payload.entityType,
      entityId: input.payload.entityId,
      payload: {
        catalogKey: input.payload.catalogKey,
        ruleId: input.payload.ruleId,
        dedupKey: input.payload.dedupKey,
      },
      occurredAt: new Date(),
      idempotencyKey: `task-auto:${orgId}:${input.payload.ruleId}:${input.payload.dedupKey}`,
    };

    await this.shadowService.persistBridgeEvaluation({
      organizationId: orgId,
      workflowId: shadow.workflowId,
      workflowVersion: plan.workflowVersion,
      event,
      plan,
    });

    if (await this.shadowGate.isLegacyCompareEnabled(orgId)) {
      await this.shadowService.recordLegacyComparison({
        organizationId: orgId,
        workflowId: shadow.workflowId,
        event,
        plan,
        legacy,
        catalogKey: input.payload.catalogKey,
        ruleId: input.payload.ruleId,
      });
    }
  }
}

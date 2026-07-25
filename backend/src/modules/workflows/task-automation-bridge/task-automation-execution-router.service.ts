import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTaskAutomationWorkflowRuntimeMode } from '@config/task-automation-workflow-runtime.config';
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
    const mode = this.getMode();

    if (mode === 'legacy' || mode === 'shadow') {
      await input.legacyExecute();
    }

    if (mode === 'shadow') {
      const orgShadowOn = await this.shadowGate.isOrgShadowEnabled(input.payload.organizationId);
      if (!orgShadowOn) {
        this.logger.debug(
          `Shadow runtime mode active but org ${input.payload.organizationId} shadow pilot disabled — skipping workflow evaluation`,
        );
        return;
      }

      const legacy = await this.shadowService.legacySnapshotFromDedup(
        input.payload.organizationId,
        input.payload.dedupKey,
      );

      const { shadow, plan } = await this.materializer.materializeViaWorkflow(
        input.payload,
        'preview',
      );

      if (shadow && plan) {
        this.shadowLog.push(shadow);
        this.logger.debug(
          `Shadow workflow preview for ${input.payload.catalogKey} dedup=${input.payload.dedupKey}: ${shadow.previewSummary}`,
        );

        const event = {
          organizationId: input.payload.organizationId,
          type: input.payload.eventType ?? 'task.automation.materialize',
          entityType: input.payload.entityType,
          entityId: input.payload.entityId,
          payload: {
            catalogKey: input.payload.catalogKey,
            ruleId: input.payload.ruleId,
            dedupKey: input.payload.dedupKey,
          },
          occurredAt: new Date(),
          idempotencyKey: `task-auto:${input.payload.organizationId}:${input.payload.ruleId}:${input.payload.dedupKey}`,
        };

        await this.shadowService.persistBridgeEvaluation({
          organizationId: input.payload.organizationId,
          workflowId: shadow.workflowId,
          workflowVersion: plan.workflowVersion,
          event,
          plan,
        });

        if (await this.shadowGate.isLegacyCompareEnabled(input.payload.organizationId)) {
          await this.shadowService.recordLegacyComparison({
            organizationId: input.payload.organizationId,
            workflowId: shadow.workflowId,
            event,
            plan,
            legacy,
            catalogKey: input.payload.catalogKey,
            ruleId: input.payload.ruleId,
          });
        }
      }
      return;
    }

    if (mode === 'cutover') {
      await this.materializer.materializeViaWorkflow(input.payload, 'execute');
    }
  }
}

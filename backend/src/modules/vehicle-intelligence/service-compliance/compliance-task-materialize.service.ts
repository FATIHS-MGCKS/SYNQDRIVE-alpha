import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InsightType, TaskSource, TaskType } from '@prisma/client';
import { TasksService } from '../../tasks/tasks.service';
import { checklistForType } from '../../tasks/task-templates';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule } from '@modules/tasks/automation/task-automation-effective-rule.util';
import {
  requireAutomationRuleByInsightType,
} from '@modules/tasks/automation/task-automation-rule.util';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { ServiceOverdueTaskService } from './service-overdue-task.service';
import { ServiceComplianceService } from './service-compliance.service';
import type { ComplianceTaskSignalDto } from './service-compliance.types';

const SOURCE_BY_CATEGORY: Record<string, { source: string; sourceType: TaskSource }> = {
  Maintenance: { source: 'INSIGHT_SERVICE', sourceType: 'ALERT' },
  'TÜV': { source: 'INSIGHT_COMPLIANCE', sourceType: 'ALERT' },
  Bokraft: { source: 'INSIGHT_COMPLIANCE', sourceType: 'ALERT' },
};

@Injectable()
export class ComplianceTaskMaterializeService {
  private readonly logger = new Logger(ComplianceTaskMaterializeService.name);

  constructor(
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly tasks: TasksService,
    private readonly serviceOverdueTasks: ServiceOverdueTaskService,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
  ) {}

  async materializeSignal(
    organizationId: string,
    vehicleId: string,
    signalKey: string,
  ) {
    const status = await this.serviceCompliance.buildServiceInfoStatus(vehicleId);
    const signal = status.taskSignals.find((s) => s.signalKey === signalKey || s.dedupeKey === signalKey);
    if (!signal) {
      throw new NotFoundException('Compliance task signal not found or no longer active');
    }
    return this.upsertFromSignal(organizationId, vehicleId, signal);
  }

  async upsertFromSignal(
    organizationId: string,
    vehicleId: string,
    signal: ComplianceTaskSignalDto,
  ) {
    if (signal.taskType === 'VEHICLE_SERVICE' && signal.serviceOverdueContext) {
      return this.serviceOverdueTasks.materializeFromSignal(organizationId, vehicleId, signal);
    }

    const catalogRule = requireAutomationRuleByInsightType(signal.insightType as InsightType);

    try {
      const resolved = await this.ruleResolver.resolveTaskAutomationRule(
        organizationId,
        catalogRule.ruleId,
      );
      if (!shouldMaterializeFromResolvedRule(resolved)) {
        return null;
      }

      const src = SOURCE_BY_CATEGORY[signal.category] ?? {
        source: 'INSIGHT_SERVICE',
        sourceType: 'ALERT' as TaskSource,
      };
      const priority = signal.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH';

      return await this.tasks.upsertByDedup(organizationId, signal.dedupeKey, {
        title: signal.title,
        description: signal.message,
        category: signal.category,
        type: signal.taskType as TaskType,
        sourceType: src.sourceType,
        priority,
        vehicleId,
        source: src.source,
        dueDate: signal.dueDate ? new Date(signal.dueDate) : null,
        blocksVehicleAvailability: signal.blocksRental,
        metadata: {
          generatedKey: signal.dedupeKey,
          insightType: signal.insightType,
          insightSeverity: signal.severity,
          suggestionOnly: signal.suggestionOnly,
          complianceSignalKind: signal.kind,
          allowAutoResolve: true,
        },
        checklist: checklistForType(signal.taskType as TaskType),
      });
    } catch (err: unknown) {
      if (this.outboxContext.fromOutbox) {
        throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
      }
      await this.outboxEnqueue.enqueueFailure(
        buildOutboxMeta({
          organizationId,
          ruleId: catalogRule.ruleId,
          ruleVersion: catalogRule.version,
          entityType: 'VEHICLE',
          entityId: vehicleId,
          operation: 'MATERIALIZE_INSIGHT_TASK',
          payload: {
            vehicleId,
            insightDedupKey: signal.dedupeKey,
            insightType: signal.insightType,
          },
        }),
        err,
      );
      this.logger.warn(
        `upsertFromSignal(${vehicleId}/${signal.dedupeKey}) failed: ${sanitizeAutomationError(err)}`,
      );
      return null;
    }
  }
}

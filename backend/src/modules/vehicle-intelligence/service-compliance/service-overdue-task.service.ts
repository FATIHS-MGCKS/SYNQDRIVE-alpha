import { Injectable, Logger } from '@nestjs/common';
import { InsightType, Prisma, TaskPriority, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { checklistForType } from '@modules/tasks/task-templates';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule } from '@modules/tasks/automation/task-automation-effective-rule.util';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { ServiceComplianceService } from './service-compliance.service';
import type { ComplianceTaskSignalDto } from './service-compliance.types';
import type { ComplianceOperationalVehicle } from './service-compliance-operational.signals';
import {
  buildServiceOverdueTaskDescription,
  buildServiceOverdueTaskMetadata,
  buildServiceOverdueTaskTitle,
  serviceOverdueDedupKey,
  type ServiceOverdueTaskContext,
} from './service-overdue-task.util';
import {
  SERVICE_OVERDUE_TASK_RULE_ID,
  SERVICE_OVERDUE_TASK_RULE_VERSION,
} from './service-overdue-task.rules';
import { FULL_SERVICE_BASELINE_EVENT_TYPES } from '../service-events/service-events.constants';

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;

@Injectable()
export class ServiceOverdueTaskService {
  private readonly logger = new Logger(ServiceOverdueTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
  ) {}

  private async handleAutomationFailure(
    organizationId: string,
    vehicleId: string,
    err: unknown,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (this.outboxContext.fromOutbox) {
      throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
    }
    await this.outboxEnqueue.enqueueFailure(
      buildOutboxMeta({
        organizationId,
        ruleId: SERVICE_OVERDUE_TASK_RULE_ID,
        ruleVersion: SERVICE_OVERDUE_TASK_RULE_VERSION,
        entityType: 'VEHICLE',
        entityId: vehicleId,
        operation: 'MATERIALIZE_INSIGHT_TASK',
        payload: { vehicleId, insightType: 'SERVICE_OVERDUE', ...payload },
      }),
      err,
    );
    this.logger.warn(
      `materializeFromSignal(${vehicleId}) failed: ${sanitizeAutomationError(err)}`,
    );
  }

  buildUpsertPayload(input: {
    vehicleId: string;
    dedupKey: string;
    ctx: ServiceOverdueTaskContext;
    insightType: string;
    insightSeverity: string;
    alertId?: string | null;
    suggestionOnly?: boolean;
    complianceSignalKind?: string;
    serviceCaseId?: string | null;
    dueDate?: Date | null;
    priority: TaskPriority;
  }) {
    return {
      title: buildServiceOverdueTaskTitle(input.ctx),
      description: buildServiceOverdueTaskDescription(input.ctx),
      category: 'Maintenance',
      type: 'VEHICLE_SERVICE' as TaskType,
      sourceType: 'ALERT' as const,
      priority: input.priority,
      vehicleId: input.vehicleId,
      alertId: input.alertId ?? null,
      source: 'INSIGHT_SERVICE',
      dueDate:
        input.dueDate ??
        (input.ctx.hmDerivedDueDate ? new Date(input.ctx.hmDerivedDueDate) : null),
      blocksVehicleAvailability: false,
      metadata: buildServiceOverdueTaskMetadata({
        dedupKey: input.dedupKey,
        insightType: input.insightType,
        insightSeverity: input.insightSeverity,
        ctx: input.ctx,
        alertId: input.alertId,
        suggestionOnly: input.suggestionOnly,
        complianceSignalKind: input.complianceSignalKind,
        serviceCaseId: input.serviceCaseId,
      }),
      checklist: checklistForType('VEHICLE_SERVICE'),
    };
  }

  async materializeFromContext(
    organizationId: string,
    input: {
      vehicleId: string;
      dedupKey: string;
      ctx: ServiceOverdueTaskContext;
      insightType: string;
      insightSeverity: string;
      alertId?: string | null;
      dueDate?: Date | null;
      priority: TaskPriority;
    },
  ): Promise<void> {
    const payload = this.buildUpsertPayload({
      vehicleId: input.vehicleId,
      dedupKey: input.dedupKey,
      ctx: input.ctx,
      insightType: input.insightType,
      insightSeverity: input.insightSeverity,
      alertId: input.alertId,
      suggestionOnly: false,
      dueDate: input.dueDate,
      priority: input.priority,
    });
    await this.tasks.upsertByDedup(organizationId, input.dedupKey, payload);
  }

  async materializeFromSignal(
    organizationId: string,
    vehicleId: string,
    signal: ComplianceTaskSignalDto,
    alertId?: string | null,
  ): Promise<unknown> {
    try {
      const resolved = await this.ruleResolver.resolveTaskAutomationRule(
        organizationId,
        SERVICE_OVERDUE_TASK_RULE_ID,
      );
      if (!shouldMaterializeFromResolvedRule(resolved)) {
        return null;
      }

      const ctx = signal.serviceOverdueContext;
      if (!ctx) {
        throw new Error('Compliance signal missing serviceOverdueContext');
      }

      const payload = this.buildUpsertPayload({
        vehicleId,
        dedupKey: signal.dedupeKey,
        ctx,
        insightType: signal.insightType,
        insightSeverity: signal.severity,
        alertId,
        suggestionOnly: signal.suggestionOnly,
        complianceSignalKind: signal.kind,
        dueDate: signal.dueDate ? new Date(signal.dueDate) : null,
        priority: signal.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      });

      return await this.tasks.upsertByDedup(organizationId, signal.dedupeKey, payload);
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        organizationId,
        vehicleId,
        err,
        { insightDedupKey: signal.dedupeKey, insightType: signal.insightType },
      );
      return null;
    }
  }

  async linkServiceCase(
    organizationId: string,
    vehicleId: string,
    serviceCaseId: string,
  ): Promise<void> {
    const task = await this.findOpenServiceOverdueTask(organizationId, vehicleId);
    if (!task) return;

    const metadata = this.mergeServiceCaseIntoMetadata(task.metadata, serviceCaseId);
    await this.prisma.orgTask.update({
      where: { id: task.id },
      data: {
        serviceCaseId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  async onServiceCaseCompleted(
    organizationId: string,
    vehicleId: string,
    serviceCaseId: string,
  ): Promise<void> {
    const openTasks = await this.findOpenServiceOverdueTasks(organizationId, vehicleId);
    const linked = openTasks.filter(
      (t) =>
        t.serviceCaseId === serviceCaseId ||
        this.readServiceCaseIdFromMetadata(t.metadata) === serviceCaseId,
    );
    for (const task of linked) {
      await this.tasks.autoResolveTask(organizationId, task.id, {
        resolutionCode: 'SERVICE_CASE_COMPLETED',
        reason: 'Linked service case completed',
        metadata: {
          ruleId: SERVICE_OVERDUE_TASK_RULE_ID,
          serviceCaseId,
          vehicleId,
        },
      });
    }
  }

  async onServiceHistoryChanged(
    organizationId: string,
    vehicle: ComplianceOperationalVehicle,
    eventType?: string,
  ): Promise<void> {
    if (eventType && !FULL_SERVICE_BASELINE_EVENT_TYPES.includes(eventType as never)) {
      return;
    }

    try {
      const evaluation = await this.serviceCompliance.evaluateCompliance(vehicle.id, {
        lastTuvDate: null,
        nextTuvDate: null,
        lastBokraftDate: null,
        nextBokraftDate: null,
      });
      const stillOverdue =
        evaluation.nextService.trackingStatus === 'TRACKED' &&
        evaluation.nextService.severity === 'CRITICAL';

      if (!stillOverdue) {
        await this.autoResolveOpenTasks(organizationId, vehicle.id, {
          resolutionCode: 'SERVICE_ALREADY_COMPLETED',
          reason: 'Service history updated — vehicle no longer overdue',
          ruleId: 'insight.service_overdue.service_event',
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`onServiceHistoryChanged(${vehicle.id}) failed: ${message}`);
    }
  }

  async autoResolveOpenTasks(
    organizationId: string,
    vehicleId: string,
    input: { resolutionCode: string; reason: string; ruleId: string },
  ): Promise<number> {
    const open = await this.findOpenServiceOverdueTasks(organizationId, vehicleId);
    for (const task of open) {
      await this.tasks.autoResolveTask(organizationId, task.id, {
        resolutionCode: input.resolutionCode,
        reason: input.reason,
        metadata: {
          ruleId: input.ruleId,
          vehicleId,
          dedupKey: task.dedupKey,
        },
      });
    }
    return open.length;
  }

  private async findOpenServiceOverdueTask(organizationId: string, vehicleId: string) {
    const rows = await this.findOpenServiceOverdueTasks(organizationId, vehicleId);
    return rows[0] ?? null;
  }

  private async findOpenServiceOverdueTasks(organizationId: string, vehicleId: string) {
    return this.prisma.orgTask.findMany({
      where: {
        organizationId,
        vehicleId,
        type: 'VEHICLE_SERVICE',
        source: 'INSIGHT_SERVICE',
        status: { in: [...ACTIVE_STATUSES] },
        dedupKey: serviceOverdueDedupKey(vehicleId),
      },
      select: { id: true, dedupKey: true, metadata: true, serviceCaseId: true },
    });
  }

  private mergeServiceCaseIntoMetadata(
    metadata: unknown,
    serviceCaseId: string,
  ): Prisma.InputJsonValue {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    return {
      ...base,
      serviceCaseId,
      serviceOverdue:
        base.serviceOverdue && typeof base.serviceOverdue === 'object'
          ? { ...(base.serviceOverdue as Record<string, unknown>), linkedServiceCaseId: serviceCaseId }
          : { linkedServiceCaseId: serviceCaseId },
    };
  }

  private readServiceCaseIdFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const meta = metadata as Record<string, unknown>;
    if (typeof meta.serviceCaseId === 'string') return meta.serviceCaseId;
    const nested = meta.serviceOverdue;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const id = (nested as Record<string, unknown>).linkedServiceCaseId;
      if (typeof id === 'string') return id;
    }
    return null;
  }
}

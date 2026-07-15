import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TaskPriority, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { checklistForType } from '@modules/tasks/task-templates';
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
import { SERVICE_OVERDUE_TASK_RULE_ID } from './service-overdue-task.rules';
import { FULL_SERVICE_BASELINE_EVENT_TYPES } from '../service-events/service-events.constants';

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;

@Injectable()
export class ServiceOverdueTaskService {
  private readonly logger = new Logger(ServiceOverdueTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

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

    return this.tasks.upsertByDedup(organizationId, signal.dedupeKey, payload);
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

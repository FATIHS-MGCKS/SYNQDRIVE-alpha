import { Injectable, Logger } from '@nestjs/common';
import { InsightSeverity, InsightType, Prisma, TaskPriority } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { checklistForType } from '@modules/tasks/task-templates';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule } from '@modules/tasks/automation/task-automation-effective-rule.util';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { buildAutomationMetadataBlock } from '@modules/tasks/automation/task-automation-rule.util';
import { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import { fetchCanonicalBatterySummarySafe } from './canonical-battery/canonical-battery-summary-fetch.util';
import {
  type BatteryTaskContract,
  type BatteryTaskIntent,
  evaluateBatteryTasks,
  isBatteryTaskDedupKey,
  shouldAutoResolveBatteryTask,
} from './battery-task.policy';
import {
  BATTERY_TASK_RULE_ID,
  BATTERY_TASK_RULE_VERSION,
} from './battery-task.rules';

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;

function mapInsightSeverityToTaskPriority(severity: InsightSeverity): TaskPriority {
  switch (severity) {
    case InsightSeverity.CRITICAL:
      return 'CRITICAL';
    case InsightSeverity.WARNING:
      return 'HIGH';
    default:
      return 'NORMAL';
  }
}

export interface BatteryInsightCandidate {
  type: string;
  dedupeKey: string;
  severity: InsightSeverity;
  entityIds: string[];
  metrics?: Record<string, unknown>;
}

@Injectable()
export class BatteryTaskService {
  private readonly logger = new Logger(BatteryTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly canonicalBatteryHealth: CanonicalBatteryHealthService,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
  ) {}

  buildUpsertPayload(input: {
    contract: BatteryTaskContract;
    vehicleId: string;
    alertId?: string | null;
    insightType?: string;
    insightSeverity?: string;
    documentId?: string | null;
    serviceCaseId?: string | null;
  }) {
    const { contract } = input;
    return {
      title: contract.title,
      description: contract.description,
      category: 'Maintenance',
      type: contract.taskType,
      sourceType: 'ALERT' as const,
      priority: mapInsightSeverityToTaskPriority(contract.severity) as TaskPriority,
      vehicleId: input.vehicleId,
      alertId: input.alertId ?? null,
      documentId: input.documentId ?? null,
      serviceCaseId: input.serviceCaseId ?? null,
      source: 'INSIGHT_HEALTH',
      dueDate: null,
      blocksVehicleAvailability: false,
      metadata: {
        generatedKey: contract.dedupeKey,
        automation: buildAutomationMetadataBlock('BATTERY_CRITICAL_HEALTH'),
        insightType: input.insightType ?? InsightType.BATTERY_CRITICAL,
        insightSeverity: input.insightSeverity ?? contract.severity,
        batteryTask: {
          policyVersion: contract.policyVersion,
          taskIntent: contract.intent,
          reason: contract.reason,
          nextAction: contract.nextAction,
          alertRuleId: contract.alertRuleId,
          alertDedupeKey: contract.alertDedupeKey,
          autoResolveWhen: contract.autoResolveWhen,
        },
        allowAutoResolve: true,
        ...contract.metrics,
      },
      checklist: checklistForType(contract.taskType),
    };
  }

  async materializeFromInsightCandidate(
    organizationId: string,
    candidate: BatteryInsightCandidate,
    alertId?: string | null,
  ): Promise<{ contracts: BatteryTaskContract[]; dedupeKeys: string[] }> {
    const vehicleId = candidate.entityIds[0];
    if (!vehicleId) {
      return { contracts: [], dedupeKeys: [] };
    }

    const resolved = await this.ruleResolver.resolveTaskAutomationRule(
      organizationId,
      BATTERY_TASK_RULE_ID,
    );
    if (!shouldMaterializeFromResolvedRule(resolved)) {
      return { contracts: [], dedupeKeys: [] };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
      },
    });
    if (!vehicle) {
      return { contracts: [], dedupeKeys: [] };
    }

    const summaryResult = await fetchCanonicalBatterySummarySafe(
      this.canonicalBatteryHealth,
      vehicleId,
      'battery-task.materializeTasksFromInsight',
    );
    const summary = summaryResult.ok ? summaryResult.summary : null;

    const metrics = (candidate.metrics ?? {}) as Record<string, unknown>;
    const contracts = evaluateBatteryTasks({
      summary,
      vehicle,
      warningLightActive: metrics.warningLightActive === true,
      activeDtcFaults: Array.isArray(metrics.activeDtcFaults)
        ? (metrics.activeDtcFaults as never)
        : undefined,
    });

    const dedupeKeys: string[] = [];
    for (const contract of contracts) {
      dedupeKeys.push(contract.dedupeKey);
      try {
        await this.tasks.upsertByDedup(
          organizationId,
          contract.dedupeKey,
          this.buildUpsertPayload({
            contract,
            vehicleId,
            alertId: contract.alertDedupeKey === candidate.dedupeKey ? alertId : alertId ?? null,
            insightType: candidate.type,
            insightSeverity: candidate.severity,
          }),
        );
        await this.autoResolveIfSatisfied(organizationId, vehicleId, contract.intent, summary);
      } catch (err: unknown) {
        await this.handleAutomationFailure(organizationId, vehicleId, contract.dedupeKey, err);
      }
    }

    return { contracts, dedupeKeys };
  }

  async syncReferenceCapacityTasksForOrganization(
    organizationId: string,
  ): Promise<string[]> {
    const resolved = await this.ruleResolver.resolveTaskAutomationRule(
      organizationId,
      BATTERY_TASK_RULE_ID,
    );
    if (!shouldMaterializeFromResolvedRule(resolved)) {
      return [];
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        status: { in: ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'RESERVED'] },
      },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
      },
    });

    const seenKeys: string[] = [];
    for (const vehicle of vehicles) {
      const summaryResult = await fetchCanonicalBatterySummarySafe(
        this.canonicalBatteryHealth,
        vehicle.id,
        'battery-task.syncReferenceCapacityTasksForOrganization',
      );
      const summary = summaryResult.ok ? summaryResult.summary : null;
      const contracts = evaluateBatteryTasks({ summary, vehicle });
      const refContract = contracts.find(
        (contract) => contract.intent === 'battery.task.reference_capacity_confirm',
      );
      if (!refContract) {
        await this.autoResolveIfSatisfied(
          organizationId,
          vehicle.id,
          'battery.task.reference_capacity_confirm',
          summary,
        );
        continue;
      }
      seenKeys.push(refContract.dedupeKey);
      try {
        await this.tasks.upsertByDedup(
          organizationId,
          refContract.dedupeKey,
          this.buildUpsertPayload({
            contract: refContract,
            vehicleId: vehicle.id,
          }),
        );
      } catch (err: unknown) {
        await this.handleAutomationFailure(
          organizationId,
          vehicle.id,
          refContract.dedupeKey,
          err,
        );
      }
    }
    return seenKeys;
  }

  async autoResolveIfSatisfied(
    organizationId: string,
    vehicleId: string,
    taskIntent: BatteryTaskIntent,
    summary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
  ): Promise<void> {
    const decision = shouldAutoResolveBatteryTask({
      taskIntent,
      summary,
      vehicleId,
    });
    if (!decision?.autoResolve) return;

    const openTasks = await this.findOpenBatteryTasks(organizationId, vehicleId);
    for (const task of openTasks) {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      if (metadata.batteryTask?.taskIntent !== taskIntent) continue;
      await this.tasks.autoResolveTask(organizationId, task.id, {
        resolutionCode: decision.resolutionCode,
        reason: decision.reason,
        metadata: {
          ruleId: BATTERY_TASK_RULE_ID,
          vehicleId,
          taskIntent,
          dedupKey: task.dedupKey,
        },
      });
    }
  }

  async onReferenceCapacityVerified(
    organizationId: string,
    vehicleId: string,
    referenceCapacityId: string,
  ): Promise<void> {
    const summaryResult = await fetchCanonicalBatterySummarySafe(
      this.canonicalBatteryHealth,
      vehicleId,
      'battery-task.onReferenceCapacityVerified',
    );
    const summary = summaryResult.ok ? summaryResult.summary : null;
    await this.autoResolveIfSatisfied(
      organizationId,
      vehicleId,
      'battery.task.reference_capacity_confirm',
      summary,
    );
    const openTasks = await this.findOpenBatteryTasks(organizationId, vehicleId);
    for (const task of openTasks) {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      if (metadata.batteryTask?.taskIntent !== 'battery.task.reference_capacity_confirm') {
        continue;
      }
      await this.prisma.orgTask.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...metadata,
            referenceCapacityId,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  async linkServiceCase(
    organizationId: string,
    vehicleId: string,
    serviceCaseId: string,
    taskIntent?: BatteryTaskIntent,
  ): Promise<void> {
    const openTasks = await this.findOpenBatteryTasks(organizationId, vehicleId);
    for (const task of openTasks) {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      if (taskIntent && metadata.batteryTask?.taskIntent !== taskIntent) continue;
      await this.prisma.orgTask.update({
        where: { id: task.id },
        data: {
          serviceCaseId,
          metadata: {
            ...metadata,
            serviceCaseId,
            batteryTask: {
              ...(metadata.batteryTask ?? {}),
              linkedServiceCaseId: serviceCaseId,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  async linkDocument(
    organizationId: string,
    vehicleId: string,
    documentId: string,
    taskIntent?: BatteryTaskIntent,
  ): Promise<void> {
    const openTasks = await this.findOpenBatteryTasks(organizationId, vehicleId);
    for (const task of openTasks) {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      if (taskIntent && metadata.batteryTask?.taskIntent !== taskIntent) continue;
      await this.prisma.orgTask.update({
        where: { id: task.id },
        data: {
          documentId,
          metadata: {
            ...metadata,
            documentId,
            batteryTask: {
              ...(metadata.batteryTask ?? {}),
              linkedDocumentId: documentId,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async findOpenBatteryTasks(organizationId: string, vehicleId: string) {
    const rows = await this.prisma.orgTask.findMany({
      where: {
        organizationId,
        vehicleId,
        status: { in: [...ACTIVE_STATUSES] },
        source: 'INSIGHT_HEALTH',
        dedupKey: { startsWith: 'battery_task:' },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.filter((row) => isBatteryTaskDedupKey(row.dedupKey));
  }

  private async handleAutomationFailure(
    organizationId: string,
    vehicleId: string,
    dedupKey: string,
    err: unknown,
  ): Promise<void> {
    if (this.outboxContext.fromOutbox) {
      throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
    }
    await this.outboxEnqueue.enqueueFailure(
      buildOutboxMeta({
        organizationId,
        ruleId: BATTERY_TASK_RULE_ID,
        ruleVersion: BATTERY_TASK_RULE_VERSION,
        entityType: 'VEHICLE',
        entityId: vehicleId,
        operation: 'MATERIALIZE_INSIGHT_TASK',
        payload: { vehicleId, dedupKey, insightType: InsightType.BATTERY_CRITICAL },
      }),
      err,
    );
    this.logger.warn(
      `Battery task materialize failed for ${dedupKey} (org ${organizationId}): ${sanitizeAutomationError(err)}`,
    );
  }
}

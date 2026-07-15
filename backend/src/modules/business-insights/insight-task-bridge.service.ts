import { Injectable, Logger } from '@nestjs/common';
import { TaskSource, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceOverdueTaskService } from '@modules/vehicle-intelligence/service-compliance/service-overdue-task.service';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import {
  automationOutboxIdentity,
  buildAutomationMetadataBlock,
  getAutomationRuleByInsightType,
  INSIGHT_TASK_BRIDGE_SOURCES,
  listMaterializationAutomationRules,
} from '@modules/tasks/automation/task-automation-rule.util';
import {
  shouldAutoMaterializeServiceOverdueTask,
  type ServiceOverdueTaskContext,
} from '@modules/vehicle-intelligence/service-compliance/service-overdue-task.util';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule } from '@modules/tasks/automation/task-automation-effective-rule.util';
import { TasksService } from '../tasks/tasks.service';
import { checklistForType } from '../tasks/task-templates';
import {
  InsightCandidate,
  InsightEntityScope,
  InsightType,
} from './insight.types';
import { mapInsightSeverityToTaskPriority } from './insight-task.mapper';

interface TaskTypeConfig {
  category: string;
  source: string;
  taskType: TaskType;
  sourceType: TaskSource;
}

/**
 * V4.7.59 — Insight (Alert) → Task bridge.
 * Severity truth stays in detectors; this maps onto task priority/title,
 * links alertId from DashboardInsight, seeds checklists, and handles dedup.
 */
@Injectable()
export class InsightTaskBridgeService {
  private readonly logger = new Logger(InsightTaskBridgeService.name);

  private static readonly TASK_TYPE_CONFIG: Partial<Record<InsightType, TaskTypeConfig>> =
    Object.fromEntries(
      listMaterializationAutomationRules()
        .filter((rule) => rule.insightType)
        .map((rule) => [
          rule.insightType!,
          {
            category: rule.category,
            source: rule.source,
            taskType: rule.taskType!,
            sourceType: rule.sourceType,
          },
        ]),
    ) as Partial<Record<InsightType, TaskTypeConfig>>;

  constructor(
    private readonly tasks: TasksService,
    private readonly prisma: PrismaService,
    private readonly serviceOverdueTasks: ServiceOverdueTaskService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
  ) {}

  private shouldMaterializeTask(candidate: InsightCandidate): boolean {
    if (candidate.type !== InsightType.SERVICE_OVERDUE) return true;

    const metrics = (candidate.metrics ?? {}) as {
      suggestionOnly?: boolean;
      serviceOverdue?: ServiceOverdueTaskContext | null;
    };
    if (metrics.suggestionOnly) return false;

    const ctx = metrics.serviceOverdue;
    if (!ctx) return candidate.severity === 'CRITICAL';

    return shouldAutoMaterializeServiceOverdueTask({
      ctx,
      severity: candidate.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      suggestionOnly: false,
    });
  }

  async materialize(
    organizationId: string,
    candidates: InsightCandidate[],
  ): Promise<{ upserted: number; closed: number }> {
    const relevant = candidates.filter(
      (c) =>
        InsightTaskBridgeService.TASK_TYPE_CONFIG[c.type] != null &&
        c.entityScope === InsightEntityScope.VEHICLE &&
        Array.isArray(c.entityIds) &&
        c.entityIds.length === 1,
    );

    const byKey = new Map<string, InsightCandidate>();
    for (const c of relevant) {
      const prev = byKey.get(c.dedupeKey);
      if (!prev || c.priority > prev.priority) byKey.set(c.dedupeKey, c);
    }

    const seenKeys: string[] = [];
    let upserted = 0;

    for (const c of byKey.values()) {
      if (!this.shouldMaterializeTask(c)) continue;

      const cfg = InsightTaskBridgeService.TASK_TYPE_CONFIG[c.type]!;
      const catalogRule = getAutomationRuleByInsightType(c.type)!;
      const resolved = await this.ruleResolver.resolveTaskAutomationRule(
        organizationId,
        catalogRule.ruleId,
      );
      if (!shouldMaterializeFromResolvedRule(resolved)) continue;

      const vehicleId = c.entityIds[0];
      const dedupKey = c.dedupeKey;
      seenKeys.push(dedupKey);

      const alert = await this.prisma.dashboardInsight.findFirst({
        where: { organizationId, dedupeKey: dedupKey, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      try {
        if (c.type === InsightType.SERVICE_OVERDUE) {
          const metrics = (c.metrics ?? {}) as {
            serviceOverdue?: ServiceOverdueTaskContext | null;
          };
          const ctx = metrics.serviceOverdue;
          if (!ctx) continue;

          await this.serviceOverdueTasks.materializeFromContext(organizationId, {
            vehicleId,
            dedupKey,
            ctx,
            insightType: c.type,
            insightSeverity: c.severity,
            alertId: alert?.id ?? null,
            dueDate: c.timeContext?.dueDate ? new Date(c.timeContext.dueDate) : null,
            priority: mapInsightSeverityToTaskPriority(c.severity),
          });
        } else {
          const priority = mapInsightSeverityToTaskPriority(c.severity);
          const dueRaw = c.timeContext?.dueDate;
          const dueDate = dueRaw ? new Date(dueRaw) : null;
          const blocksRental =
            c.type === InsightType.TUV_OVERDUE || c.type === InsightType.BOKRAFT_OVERDUE
              ? c.severity === 'CRITICAL'
              : false;

          await this.tasks.upsertByDedup(organizationId, dedupKey, {
            title: c.title,
            description: c.message,
            category: cfg.category,
            type: cfg.taskType,
            sourceType: cfg.sourceType,
            priority,
            vehicleId,
            alertId: alert?.id ?? null,
            source: cfg.source,
            dueDate,
            blocksVehicleAvailability: blocksRental,
            metadata: {
              generatedKey: dedupKey,
              automation: buildAutomationMetadataBlock(catalogRule),
              insightType: c.type,
              insightSeverity: c.severity,
              suggestionOnly: c.severity === 'WARNING',
              allowAutoResolve: true,
            },
            checklist: checklistForType(cfg.taskType),
          });
        }
        upserted++;
      } catch (err: unknown) {
        if (this.outboxContext.fromOutbox) {
          throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
        }
        await this.outboxEnqueue.enqueueFailure(
          buildOutboxMeta({
            organizationId,
            ...automationOutboxIdentity(catalogRule),
            entityType: 'INSIGHT',
            entityId: vehicleId,
            operation: 'MATERIALIZE_INSIGHT_TASK',
            payload: {
              insightDedupKey: dedupKey,
              insightType: c.type,
              vehicleId,
            },
          }),
          err,
        );
        this.logger.warn(
          `upsertByDedup failed for ${dedupKey} (org ${organizationId}): ${sanitizeAutomationError(err)}`,
        );
      }
    }

    let closed = 0;
    closed = await this.tasks.closeStaleInsightTasks(
      organizationId,
      seenKeys,
      INSIGHT_TASK_BRIDGE_SOURCES,
    );

    if (upserted > 0 || closed > 0) {
      this.logger.log(
        `Insight→Task bridge org ${organizationId}: ${upserted} upserted, ${closed} auto-closed`,
      );
    }
    return { upserted, closed };
  }

  /** Replays a single insight→task materialization from outbox (reloads active insight). */
  async rematerializeFromOutbox(organizationId: string, insightDedupKey: string): Promise<void> {
    const insight = await this.prisma.dashboardInsight.findFirst({
      where: { organizationId, dedupeKey: insightDedupKey, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!insight) {
      throw new Error(`Active insight ${insightDedupKey} not found for org ${organizationId}`);
    }

    const metrics = (insight.metrics ?? {}) as Record<string, unknown>;
    const entityIds = Array.isArray(insight.entityIds)
      ? (insight.entityIds as string[])
      : [];
    const reasons = Array.isArray(insight.reasons) ? (insight.reasons as string[]) : [];
    const timeContext =
      insight.timeContext && typeof insight.timeContext === 'object'
        ? (insight.timeContext as Record<string, string>)
        : undefined;

    await this.materialize(organizationId, [
      {
        type: insight.type,
        dedupeKey: insight.dedupeKey,
        title: insight.title,
        message: insight.message,
        severity: insight.severity,
        priority: insight.priority,
        entityScope: insight.entityScope,
        entityIds,
        metrics,
        reasons,
        confidence: insight.confidence,
        timeContext,
      },
    ]);
  }
}

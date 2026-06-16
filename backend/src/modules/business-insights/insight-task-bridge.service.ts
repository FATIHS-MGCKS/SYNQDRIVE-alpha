import { Injectable, Logger } from '@nestjs/common';
import { TaskSource, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
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

  private static readonly TASK_TYPE_CONFIG: Partial<Record<InsightType, TaskTypeConfig>> = {
    [InsightType.SERVICE_OVERDUE]: { category: 'Maintenance', source: 'INSIGHT_SERVICE', taskType: 'VEHICLE_SERVICE', sourceType: 'ALERT' },
    [InsightType.TUV_OVERDUE]: { category: 'TÜV', source: 'INSIGHT_COMPLIANCE', taskType: 'VEHICLE_INSPECTION', sourceType: 'ALERT' },
    [InsightType.BOKRAFT_OVERDUE]: { category: 'BOKraft', source: 'INSIGHT_COMPLIANCE', taskType: 'VEHICLE_INSPECTION', sourceType: 'ALERT' },
    [InsightType.TIRE_CRITICAL]: { category: 'Tire Change', source: 'INSIGHT_HEALTH', taskType: 'TIRE_CHECK', sourceType: 'ALERT' },
    [InsightType.BRAKE_CRITICAL]: { category: 'Repair', source: 'INSIGHT_HEALTH', taskType: 'BRAKE_CHECK', sourceType: 'ALERT' },
    [InsightType.BATTERY_CRITICAL]: { category: 'Maintenance', source: 'INSIGHT_HEALTH', taskType: 'BATTERY_CHECK', sourceType: 'ALERT' },
  };

  private static readonly BRIDGE_SOURCES = ['INSIGHT_SERVICE', 'INSIGHT_COMPLIANCE', 'INSIGHT_HEALTH'];

  constructor(
    private readonly tasks: TasksService,
    private readonly prisma: PrismaService,
  ) {}

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
      const cfg = InsightTaskBridgeService.TASK_TYPE_CONFIG[c.type]!;
      const vehicleId = c.entityIds[0];
      const dedupKey = c.dedupeKey;
      seenKeys.push(dedupKey);

      const priority = mapInsightSeverityToTaskPriority(c.severity);
      const dueRaw = c.timeContext?.dueDate;
      const dueDate = dueRaw ? new Date(dueRaw) : null;

      const alert = await this.prisma.dashboardInsight.findFirst({
        where: { organizationId, dedupeKey: dedupKey, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      try {
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
          metadata: { generatedKey: dedupKey, insightType: c.type, insightSeverity: c.severity },
          checklist: checklistForType(cfg.taskType),
        });
        upserted++;
      } catch (err: any) {
        this.logger.warn(
          `upsertByDedup failed for ${dedupKey} (org ${organizationId}): ${err?.message ?? err}`,
        );
      }
    }

    let closed = 0;
    try {
      closed = await this.tasks.closeStaleInsightTasks(
        organizationId,
        seenKeys,
        InsightTaskBridgeService.BRIDGE_SOURCES,
      );
    } catch (err: any) {
      this.logger.warn(
        `closeStaleInsightTasks failed for org ${organizationId}: ${err?.message ?? err}`,
      );
    }

    if (upserted > 0 || closed > 0) {
      this.logger.log(
        `Insight→Task bridge org ${organizationId}: ${upserted} upserted, ${closed} auto-closed`,
      );
    }
    return { upserted, closed };
  }
}

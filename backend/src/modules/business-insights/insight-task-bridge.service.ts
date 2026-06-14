import { Injectable, Logger } from '@nestjs/common';
import { TaskSource, TaskType } from '@prisma/client';
import { TasksService } from '../tasks/tasks.service';
import {
  InsightCandidate,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from './insight.types';

interface TaskTypeConfig {
  category: string;
  source: string;
  taskType: TaskType;
  sourceType: TaskSource;
}

/**
 * V4.7.59 — Insight→Task bridge.
 *
 * Consumes the per-vehicle insight candidates of a single run and materializes
 * them into actionable OrgTasks. The same `dedupKey` is reused across the
 * "imminent" (WARNING → HIGH "bald fällig") and "overdue" (CRITICAL → URGENT
 * "überfällig") lifecycle so a single task escalates rather than duplicating.
 *
 * Severity truth stays in the detectors — this bridge only maps it onto task
 * priority/title and handles idempotency + auto-close.
 */
@Injectable()
export class InsightTaskBridgeService {
  private readonly logger = new Logger(InsightTaskBridgeService.name);

  // Only these candidate types become tasks. Each maps to a typed task and a
  // provenance `source` (the auto-close whitelist below). Health-critical
  // insights (V4.8.3) flow through the same bridge so a single task per
  // (vehicle, condition) escalates/auto-closes with the alert.
  private static readonly TASK_TYPE_CONFIG: Partial<Record<InsightType, TaskTypeConfig>> = {
    [InsightType.SERVICE_OVERDUE]: { category: 'Maintenance', source: 'INSIGHT_SERVICE', taskType: 'VEHICLE_SERVICE', sourceType: 'SYSTEM' },
    [InsightType.TUV_OVERDUE]: { category: 'TÜV', source: 'INSIGHT_COMPLIANCE', taskType: 'VEHICLE_INSPECTION', sourceType: 'SYSTEM' },
    [InsightType.BOKRAFT_OVERDUE]: { category: 'BOKraft', source: 'INSIGHT_COMPLIANCE', taskType: 'VEHICLE_INSPECTION', sourceType: 'SYSTEM' },
    [InsightType.TIRE_CRITICAL]: { category: 'Tire Change', source: 'INSIGHT_HEALTH', taskType: 'TIRE_CHECK', sourceType: 'HEALTH' },
    [InsightType.BRAKE_CRITICAL]: { category: 'Repair', source: 'INSIGHT_HEALTH', taskType: 'BRAKE_CHECK', sourceType: 'HEALTH' },
    [InsightType.BATTERY_CRITICAL]: { category: 'Maintenance', source: 'INSIGHT_HEALTH', taskType: 'BATTERY_CHECK', sourceType: 'HEALTH' },
  };

  private static readonly BRIDGE_SOURCES = ['INSIGHT_SERVICE', 'INSIGHT_COMPLIANCE', 'INSIGHT_HEALTH'];

  constructor(private readonly tasks: TasksService) {}

  async materialize(
    organizationId: string,
    candidates: InsightCandidate[],
  ): Promise<{ upserted: number; closed: number }> {
    // Only per-vehicle candidates of whitelisted types. Grouped/station-scoped
    // candidates are intentionally excluded — tasks are per vehicle.
    const relevant = candidates.filter(
      (c) =>
        InsightTaskBridgeService.TASK_TYPE_CONFIG[c.type] != null &&
        c.entityScope === InsightEntityScope.VEHICLE &&
        Array.isArray(c.entityIds) &&
        c.entityIds.length === 1,
    );

    // Collapse duplicate keys (defensive — a detector could emit twice) and
    // keep the most severe candidate per key.
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

      const priority = c.severity === InsightSeverity.CRITICAL ? 'URGENT' : 'HIGH';
      const dueRaw = c.timeContext?.dueDate;
      const dueDate = dueRaw ? new Date(dueRaw) : null;

      try {
        await this.tasks.upsertByDedup(organizationId, dedupKey, {
          title: c.title,
          description: c.message,
          category: cfg.category,
          type: cfg.taskType,
          sourceType: cfg.sourceType,
          priority,
          vehicleId,
          source: cfg.source,
          dueDate,
          metadata: { generatedKey: dedupKey, insightType: c.type },
        });
        upserted++;
      } catch (err: any) {
        this.logger.warn(
          `upsertByDedup failed for ${dedupKey} (org ${organizationId}): ${err?.message ?? err}`,
        );
      }
    }

    // Anything previously auto-created but no longer firing this run is closed.
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

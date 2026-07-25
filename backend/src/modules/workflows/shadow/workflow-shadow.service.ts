import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrgWorkflow,
  Prisma,
  WorkflowShadowRunStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowDryRunService } from '../workflow-dry-run.service';
import type { WorkflowDomainEvent } from '../workflow-engine.service';
import { WorkflowExecutionMode } from '../workflow-execution-mode';
import type { WorkflowExecutionPlan } from '../workflow-execution-plan.types';
import { sanitizePreviewRecord } from '../workflow-preview.util';
import {
  compareLegacyTaskWithShadowPlan,
  legacySnapshotFromTask,
} from './workflow-shadow-comparison.util';
import { WorkflowShadowGateService } from './workflow-shadow-gate.service';
import type {
  LegacyTaskSnapshot,
  WorkflowShadowDeviationSummary,
  WorkflowShadowRunSummary,
} from './workflow-shadow.types';

function resolveShadowStatus(plan: WorkflowExecutionPlan): WorkflowShadowRunStatus {
  if (!plan.scope.passed) return 'SKIPPED_SCOPE';
  if (!plan.conditions.passed) return 'SKIPPED_CONDITIONS';
  if (plan.policyBlockers.length > 0) return 'POLICY_BLOCKED';
  return 'PLANNED';
}

function wouldTriggerFromPlan(plan: WorkflowExecutionPlan): boolean {
  return (
    plan.scope.passed
    && plan.conditions.passed
    && plan.plannedActions.length > 0
    && plan.policyBlockers.length === 0
  );
}

@Injectable()
export class WorkflowShadowService {
  private readonly logger = new Logger(WorkflowShadowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dryRun: WorkflowDryRunService,
    private readonly gate: WorkflowShadowGateService,
    private readonly config: ConfigService,
  ) {}

  scheduleShadowEvaluation(workflow: OrgWorkflow, event: WorkflowDomainEvent): void {
    void this.evaluateAndPersist(workflow, event).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Shadow evaluation failed for org ${event.organizationId} workflow ${workflow.id}: ${message}`,
      );
    });
  }

  async evaluateAndPersist(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
  ): Promise<string | null> {
    const gate = await this.gate.resolve(event.organizationId, workflow);
    if (!gate.runShadow) return null;

    const baseKey =
      event.idempotencyKey
      ?? `${event.type}:${event.entityType ?? 'none'}:${event.entityId ?? 'none'}`;
    const eventIdempotencyKey = `${baseKey}:shadow:workflow:${workflow.id}`;

    const existing = await this.prisma.orgWorkflowShadowRun.findUnique({
      where: {
        organizationId_eventIdempotencyKey_workflowId: {
          organizationId: event.organizationId,
          eventIdempotencyKey,
          workflowId: workflow.id,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    let plan: WorkflowExecutionPlan;
    try {
      plan = await this.dryRun.planWorkflow(workflow, event, {
        correlationId: randomUUID(),
      });
      plan = {
        ...plan,
        executionMode: WorkflowExecutionMode.SHADOW,
        message: 'Shadow evaluation — no actions executed, no providers contacted, no live metrics updated.',
      } as WorkflowExecutionPlan;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const retentionDays = await this.gate.getRetentionDays(event.organizationId);
      const expiresAt = new Date(Date.now() + retentionDays * 86_400_000);
      const row = await this.prisma.orgWorkflowShadowRun.create({
        data: {
          organizationId: event.organizationId,
          workflowId: workflow.id,
          workflowVersion: workflow.version,
          eventType: event.type,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          eventIdempotencyKey,
          status: 'ERROR',
          wouldTrigger: false,
          executionPlan: sanitizePreviewRecord({ error: message }) as Prisma.InputJsonValue,
          correlationId: randomUUID(),
          occurredAt: event.occurredAt ?? new Date(),
          expiresAt,
        },
      });
      return row.id;
    }

    const retentionDays = await this.gate.getRetentionDays(event.organizationId);
    const expiresAt = new Date(Date.now() + retentionDays * 86_400_000);
    const row = await this.prisma.orgWorkflowShadowRun.create({
      data: {
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        eventType: event.type,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        eventIdempotencyKey,
        status: resolveShadowStatus(plan),
        wouldTrigger: wouldTriggerFromPlan(plan),
        wouldCreateApprovals: plan.wouldCreateApprovals,
        plannedActionCount: plan.plannedActions.length,
        policyBlockerCount: plan.policyBlockers.length,
        executionPlan: plan as unknown as Prisma.InputJsonValue,
        correlationId: plan.correlationId,
        occurredAt: event.occurredAt ?? new Date(),
        expiresAt,
      },
    });

    return row.id;
  }

  async persistBridgeEvaluation(input: {
    organizationId: string;
    workflowId: string;
    workflowVersion: number;
    event: WorkflowDomainEvent;
    plan: WorkflowExecutionPlan;
  }): Promise<string | null> {
    const orgEnabled = await this.gate.isOrgShadowEnabled(input.organizationId);
    if (!orgEnabled) return null;

    const baseKey =
      input.event.idempotencyKey
      ?? `${input.event.type}:${input.event.entityType ?? 'none'}:${input.event.entityId ?? 'none'}`;
    const eventIdempotencyKey = `${baseKey}:shadow:workflow:${input.workflowId}`;

    const existing = await this.prisma.orgWorkflowShadowRun.findUnique({
      where: {
        organizationId_eventIdempotencyKey_workflowId: {
          organizationId: input.organizationId,
          eventIdempotencyKey,
          workflowId: input.workflowId,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const plan: WorkflowExecutionPlan = {
      ...input.plan,
      executionMode: WorkflowExecutionMode.SHADOW,
    };
    const retentionDays = await this.gate.getRetentionDays(input.organizationId);
    const expiresAt = new Date(Date.now() + retentionDays * 86_400_000);

    const row = await this.prisma.orgWorkflowShadowRun.create({
      data: {
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        workflowVersion: input.workflowVersion,
        eventType: input.event.type,
        entityType: input.event.entityType ?? null,
        entityId: input.event.entityId ?? null,
        eventIdempotencyKey,
        status: resolveShadowStatus(plan),
        wouldTrigger: wouldTriggerFromPlan(plan),
        wouldCreateApprovals: plan.wouldCreateApprovals,
        plannedActionCount: plan.plannedActions.length,
        policyBlockerCount: plan.policyBlockers.length,
        executionPlan: plan as unknown as Prisma.InputJsonValue,
        correlationId: plan.correlationId,
        occurredAt: input.event.occurredAt ?? new Date(),
        expiresAt,
      },
    });
    return row.id;
  }

  async recordLegacyComparison(input: {
    organizationId: string;
    workflowId: string;
    event: WorkflowDomainEvent;
    plan: WorkflowExecutionPlan;
    legacy: LegacyTaskSnapshot | null;
    catalogKey?: string;
    ruleId?: string;
  }): Promise<string | null> {
    if (!(await this.gate.isLegacyCompareEnabled(input.organizationId))) return null;

    const baseKey =
      input.event.idempotencyKey
      ?? `${input.event.type}:${input.event.entityType ?? 'none'}:${input.event.entityId ?? 'none'}`;
    const eventIdempotencyKey = `${baseKey}:shadow:workflow:${input.workflowId}`;

    let shadowRunId: string | undefined = (
      await this.prisma.orgWorkflowShadowRun.findUnique({
        where: {
          organizationId_eventIdempotencyKey_workflowId: {
            organizationId: input.organizationId,
            eventIdempotencyKey,
            workflowId: input.workflowId,
          },
        },
        select: { id: true },
      })
    )?.id;

    if (!shadowRunId) {
      shadowRunId = (await this.persistBridgeEvaluation({
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        workflowVersion: input.plan.workflowVersion,
        event: input.event,
        plan: input.plan,
      })) ?? undefined;
    }

    if (!shadowRunId) return null;

    const comparison = compareLegacyTaskWithShadowPlan(input.legacy, input.plan);

    const row = await this.prisma.orgWorkflowShadowComparison.create({
      data: {
        organizationId: input.organizationId,
        shadowRunId,
        catalogKey: input.catalogKey ?? input.legacy?.catalogKey ?? null,
        legacyRuleId: input.ruleId ?? input.legacy?.ruleId ?? null,
        dedupKey: input.legacy?.dedupKey ?? null,
        legacyTaskId: input.legacy?.taskId ?? null,
        workflowWouldTrigger: comparison.workflowWouldTrigger,
        legacyDidExecute: comparison.legacyDidExecute,
        hasDeviation: comparison.hasDeviation,
        deviationReasons: comparison.deviationReasons,
        comparison: comparison.comparison as Prisma.InputJsonValue,
        triggerAtDeltaMs: comparison.triggerAtDeltaMs,
        dueAtDeltaMs: comparison.dueAtDeltaMs,
      },
    });

    return row.id;
  }

  async buildPlanForWorkflow(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
  ): Promise<WorkflowExecutionPlan> {
    const plan = await this.dryRun.planWorkflow(workflow, event);
    return {
      ...plan,
      executionMode: WorkflowExecutionMode.SHADOW,
      message: 'Shadow evaluation — no actions executed.',
    } as WorkflowExecutionPlan;
  }

  async legacySnapshotFromDedup(
    organizationId: string,
    dedupKey: string,
  ): Promise<LegacyTaskSnapshot | null> {
    const task = await this.prisma.orgTask.findFirst({
      where: { organizationId, dedupKey },
      orderBy: { updatedAt: 'desc' },
    });
    if (!task) return null;
    return legacySnapshotFromTask(task);
  }

  async getSettings(orgId: string) {
    const row = await this.prisma.orgWorkflowShadowSettings.findUnique({
      where: { organizationId: orgId },
    });
    return {
      organizationId: orgId,
      enabled: row?.enabled ?? false,
      legacyCompareEnabled: row?.legacyCompareEnabled ?? true,
      retentionDays:
        row?.retentionDays ?? this.config.get<number>('workflowShadow.defaultRetentionDays') ?? 30,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async updateSettings(
    orgId: string,
    dto: { enabled?: boolean; legacyCompareEnabled?: boolean; retentionDays?: number },
    userId?: string,
  ) {
    const row = await this.prisma.orgWorkflowShadowSettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        enabled: dto.enabled ?? false,
        legacyCompareEnabled: dto.legacyCompareEnabled ?? true,
        retentionDays: dto.retentionDays ?? 30,
        updatedByUserId: userId ?? null,
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.legacyCompareEnabled !== undefined
          ? { legacyCompareEnabled: dto.legacyCompareEnabled }
          : {}),
        ...(dto.retentionDays !== undefined ? { retentionDays: dto.retentionDays } : {}),
        updatedByUserId: userId ?? null,
      },
    });
    this.gate.invalidateOrgCache(orgId);
    return {
      organizationId: orgId,
      enabled: row.enabled,
      legacyCompareEnabled: row.legacyCompareEnabled,
      retentionDays: row.retentionDays,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async setWorkflowShadowEnabled(
    orgId: string,
    workflowId: string,
    shadowEnabled: boolean,
  ): Promise<{ workflowId: string; shadowEnabled: boolean }> {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');

    await this.prisma.orgWorkflow.update({
      where: { id: workflowId },
      data: { shadowEnabled },
    });

    return { workflowId, shadowEnabled };
  }

  async listRuns(
    orgId: string,
    query: { workflowId?: string; limit?: number; cursor?: string },
  ): Promise<{ data: WorkflowShadowRunSummary[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.orgWorkflowShadowRun.findMany({
      where: {
        organizationId: orgId,
        ...(query.workflowId ? { workflowId: query.workflowId } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        comparisons: { where: { hasDeviation: true }, take: 1, select: { id: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      data: page.map((row) => ({
        id: row.id,
        workflowId: row.workflowId,
        workflowVersion: row.workflowVersion,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        status: row.status,
        wouldTrigger: row.wouldTrigger,
        wouldCreateApprovals: row.wouldCreateApprovals,
        plannedActionCount: row.plannedActionCount,
        policyBlockerCount: row.policyBlockerCount,
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        hasDeviation: row.comparisons.length > 0,
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async getRun(orgId: string, runId: string) {
    const row = await this.prisma.orgWorkflowShadowRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: { comparisons: true },
    });
    if (!row) throw new NotFoundException('Shadow run not found');
    return row;
  }

  async getDeviationSummary(orgId: string): Promise<WorkflowShadowDeviationSummary> {
    const [totalComparisons, deviationCount, recent] = await Promise.all([
      this.prisma.orgWorkflowShadowComparison.count({ where: { organizationId: orgId } }),
      this.prisma.orgWorkflowShadowComparison.count({
        where: { organizationId: orgId, hasDeviation: true },
      }),
      this.prisma.orgWorkflowShadowComparison.findMany({
        where: { organizationId: orgId, hasDeviation: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          shadowRunId: true,
          catalogKey: true,
          dedupKey: true,
          deviationReasons: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalComparisons,
      deviationCount,
      recentDeviations: recent.map((row) => ({
        id: row.id,
        shadowRunId: row.shadowRunId,
        catalogKey: row.catalogKey,
        dedupKey: row.dedupKey,
        deviationReasons: Array.isArray(row.deviationReasons)
          ? (row.deviationReasons as string[])
          : [],
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async purgeExpired(organizationId?: string): Promise<number> {
    const result = await this.prisma.orgWorkflowShadowRun.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
        ...(organizationId ? { organizationId } : {}),
      },
    });
    return result.count;
  }
}

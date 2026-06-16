import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  InsightCandidate,
  InsightSeverity,
  DashboardInsightsResponse,
  DashboardInsightDto,
  InsightRunSummaryDto,
  InsightRunDetailDto,
} from './insight.types';

@Injectable()
export class DashboardInsightsRepository {
  private readonly logger = new Logger(DashboardInsightsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Run lifecycle ─────────────────────────────────────────────────

  async createRun(organizationId: string, trigger: string) {
    return this.prisma.dashboardInsightRun.create({
      data: { organizationId, trigger, startedAt: new Date() },
    });
  }

  async completeRun(runId: string, candidateCount: number, publishedCount: number, errorMessage?: string) {
    const finishedAt = new Date();
    const run = await this.prisma.dashboardInsightRun.findUnique({ where: { id: runId } });
    const durationMs = run ? finishedAt.getTime() - run.startedAt.getTime() : null;
    return this.prisma.dashboardInsightRun.update({
      where: { id: runId },
      data: { finishedAt, durationMs, candidateCount, publishedCount, errorMessage },
    });
  }

  // ─── Expire / publish / prune ──────────────────────────────────────

  async expireStaleInsights(organizationId: string) {
    const now = new Date();
    const { count } = await this.prisma.dashboardInsight.updateMany({
      where: {
        organizationId,
        isActive: true,
        expiresAt: { not: null, lte: now },
      },
      data: { isActive: false },
    });
    if (count > 0) this.logger.debug(`Expired ${count} stale insights for org ${organizationId}`);
    return count;
  }

  async publishInsights(organizationId: string, runId: string, candidates: InsightCandidate[]) {
    await this.prisma.$transaction([
      this.prisma.dashboardInsight.updateMany({
        where: { organizationId, isActive: true },
        data: { isActive: false },
      }),
      ...candidates.map((c) =>
        this.prisma.dashboardInsight.create({
          data: {
            organizationId,
            runId,
            type: c.type,
            severity: c.severity,
            priority: Math.round(c.priority),
            title: c.title,
            message: c.message,
            actionLabel: c.actionLabel,
            actionType: c.actionType,
            entityScope: c.entityScope,
            entityIds: c.entityIds,
            timeContext: c.timeContext ?? undefined,
            metrics: c.metrics ?? undefined,
            reasons: c.reasons,
            confidence: c.confidence,
            dedupeKey: c.dedupeKey,
            groupKey: c.groupKey,
            isGrouped: (c.entityIds?.length ?? 0) > 1,
            groupCount: c.entityIds?.length ?? 1,
            isActive: true,
            expiresAt: c.expiresAt,
          },
        }),
      ),
    ]);
  }

  async pruneOldRuns(organizationId: string, keepDays = 7) {
    const cutoff = new Date(Date.now() - keepDays * 86400_000);
    await this.prisma.dashboardInsight.deleteMany({
      where: { organizationId, isActive: false, createdAt: { lt: cutoff } },
    });
    await this.prisma.dashboardInsightRun.deleteMany({
      where: { organizationId, createdAt: { lt: cutoff } },
    });
  }

  // ─── Dashboard read (persisted, no recalculation) ──────────────────

  async getActiveInsights(organizationId: string, limit: number): Promise<DashboardInsightsResponse> {
    await this.expireStaleInsights(organizationId);

    const insights = await this.prisma.dashboardInsight.findMany({
      where: { organizationId, isActive: true },
      orderBy: { priority: 'desc' },
      take: limit,
    });

    const lastRun = await this.prisma.dashboardInsightRun.findFirst({
      where: { organizationId, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, errorMessage: true, startedAt: true },
    });

    const policy = await this.prisma.tenantInsightPolicy.findUnique({
      where: { organizationId },
      select: { refreshIntervalMin: true },
    });
    const refreshMin = policy?.refreshIntervalMin ?? 30;
    const staleThresholdMs = refreshMin * 60_000 * 2;
    const lastRunAt = lastRun?.finishedAt ?? null;
    const stale =
      lastRunAt != null
        ? Date.now() - lastRunAt.getTime() > staleThresholdMs
        : false;

    const dtos = insights.map((i) => this.toInsightDto(i));

    const summary = {
      total: insights.length,
      critical: insights.filter((i) => i.severity === InsightSeverity.CRITICAL).length,
      warning: insights.filter((i) => i.severity === InsightSeverity.WARNING).length,
      opportunity: insights.filter((i) => i.severity === InsightSeverity.OPPORTUNITY).length,
      info: insights.filter((i) => i.severity === InsightSeverity.INFO).length,
    };

    return {
      generatedAt: lastRunAt?.toISOString() ?? null,
      hasRun: lastRunAt != null,
      lastRunAt: lastRunAt?.toISOString() ?? null,
      stale,
      activeInsightCount: insights.length,
      error: lastRun?.errorMessage ?? null,
      summary,
      insights: dtos,
    };
  }

  // ─── Run history & diagnostics ─────────────────────────────────────

  async getRunHistory(organizationId: string, limit = 20): Promise<InsightRunSummaryDto[]> {
    const runs = await this.prisma.dashboardInsightRun.findMany({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return runs.map((r) => this.toRunSummaryDto(r));
  }

  async getRunDetail(runId: string): Promise<InsightRunDetailDto | null> {
    const run = await this.prisma.dashboardInsightRun.findUnique({
      where: { id: runId },
      include: { insights: { orderBy: { priority: 'desc' } } },
    });
    if (!run) return null;

    return {
      ...this.toRunSummaryDto(run),
      insights: run.insights.map((i) => this.toInsightDto(i)),
    };
  }

  async getLastRunForOrg(organizationId: string): Promise<InsightRunSummaryDto | null> {
    const run = await this.prisma.dashboardInsightRun.findFirst({
      where: { organizationId, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
    });
    return run ? this.toRunSummaryDto(run) : null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private toInsightDto(i: any): DashboardInsightDto {
    return {
      id: i.id,
      type: i.type,
      severity: i.severity,
      priority: i.priority,
      title: i.title,
      message: i.message,
      actionLabel: i.actionLabel,
      actionType: i.actionType,
      entityScope: i.entityScope,
      entityIds: i.entityIds as string[] | null,
      timeContext: i.timeContext as Record<string, string> | null,
      metrics: i.metrics as Record<string, any> | null,
      reasons: i.reasons as string[] | null,
      isGrouped: i.isGrouped,
      groupCount: i.groupCount,
      createdAt: i.createdAt.toISOString(),
    };
  }

  private toRunSummaryDto(r: any): InsightRunSummaryDto {
    return {
      id: r.id,
      organizationId: r.organizationId,
      trigger: r.trigger,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      durationMs: r.durationMs ?? null,
      candidateCount: r.candidateCount,
      publishedCount: r.publishedCount,
      errorMessage: r.errorMessage ?? null,
    };
  }
}

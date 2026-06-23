import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  BillingStatus,
  SupportTicketStatus,
  DimoPollStatus,
  EnrichmentJobStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface ActivityLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  userId: string | null;
  userName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  totalVehicles: number;
  totalDimoVehicles: number;
  totalRevenueMrr: number;
  activeSubscriptions: number;
  trialOrganizations: number;
  suspendedOrganizations: number;
  totalProspects: number;
  openSupportTickets: number;
  recentActivity: ActivityLogEntry[];
}

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(): Promise<DashboardStats> {
    const [
      totalOrganizations,
      activeOrganizations,
      trialOrganizations,
      suspendedOrganizations,
      totalUsers,
      totalVehicles,
      totalDimoVehicles,
      activeSubscriptions,
      totalProspects,
      openSupportTickets,
      subscriptionsForMrr,
      recentLogs,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: OrganizationStatus.ACTIVE } }),
      this.prisma.organization.count({ where: { status: OrganizationStatus.PENDING } }),
      this.prisma.organization.count({ where: { status: OrganizationStatus.SUSPENDED } }),
      this.prisma.user.count(),
      this.prisma.vehicle.count(),
      this.prisma.dimoVehicle.count(),
      this.prisma.billingSubscription.count({
        where: { status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] } },
      }),
      this.prisma.prospect.count(),
      this.prisma.supportTicket.count({
        where: {
          status: {
            in: [
              SupportTicketStatus.OPEN,
              SupportTicketStatus.IN_PROGRESS,
              SupportTicketStatus.WAITING_FOR_CUSTOMER,
            ],
          },
        },
      }),
      this.prisma.billingSubscription.findMany({
        where: { status: BillingStatus.ACTIVE },
        include: {
          invoices: {
            orderBy: { invoiceDate: 'desc' },
            take: 1,
            select: { amountCents: true },
          },
        },
      }),
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { id: true, name: true } },
          organization: { select: { id: true, companyName: true } },
        },
      }),
    ]);

    const totalRevenueMrr = subscriptionsForMrr.reduce((sum, sub) => {
      const latest = sub.invoices[0];
      return sum + (latest ? latest.amountCents / 100 : 0);
    }, 0);

    const recentActivity: ActivityLogEntry[] = recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      description: log.description,
      userId: log.userId,
      userName: log.user?.name || null,
      organizationId: log.organizationId,
      organizationName: log.organization?.companyName || null,
      createdAt: log.createdAt.toISOString(),
    }));

    return {
      totalOrganizations,
      activeOrganizations,
      totalUsers,
      totalVehicles,
      totalDimoVehicles,
      totalRevenueMrr,
      activeSubscriptions,
      trialOrganizations,
      suspendedOrganizations,
      totalProspects,
      openSupportTickets,
      recentActivity,
    };
  }

  async getOrganizationStats() {
    const [active, trial, suspended, churned, total] = await Promise.all([
      this.prisma.organization.count({ where: { status: OrganizationStatus.ACTIVE } }),
      this.prisma.organization.count({ where: { status: OrganizationStatus.PENDING } }),
      this.prisma.organization.count({ where: { status: OrganizationStatus.SUSPENDED } }),
      this.prisma.organization.count({ where: { status: OrganizationStatus.ARCHIVED } }),
      this.prisma.organization.count(),
    ]);

    return { total, active, trial, suspended, churned };
  }

  /**
   * ⚠️  DRIFT WARNING — mirrors the CLI script at
   *     `prisma/prune-master-data.ts`. When adding new entities to the prune
   *     list, keep both paths in sync (see the header of that file).
   */
  async pruneMasterData(): Promise<{ message: string }> {
    await this.prisma.booking.deleteMany({});
    await this.prisma.customer.deleteMany({});
    await this.prisma.prospect.updateMany({ data: { convertedOrgId: null } });
    await this.prisma.prospect.deleteMany({});
    await this.prisma.vehicleLatestState.deleteMany({});
    await this.prisma.vehiclePositionUpdate.deleteMany({});
    await this.prisma.analyticsCache.deleteMany({});
    await this.prisma.dimoPollLog.deleteMany({});
    await this.prisma.vehicleEnrichmentJob.deleteMany({});
    await this.prisma.vehicleServiceEvent.deleteMany({});
    await this.prisma.vehicleTireTreadMeasurement.deleteMany({});
    await this.prisma.vehicleTireSetup.deleteMany({});
    await this.prisma.vehicleBrakeReferenceSpec.deleteMany({});
    await this.prisma.vehicleBatterySpec.deleteMany({});
    await this.prisma.vehicle.deleteMany({});
    await this.prisma.station.deleteMany({});
    await this.prisma.organizationIntegration.deleteMany({});
    await this.prisma.organizationProduct.deleteMany({});
    await this.prisma.billingInvoiceLine.deleteMany({});
    await this.prisma.billingUsageSnapshot.deleteMany({});
    await this.prisma.billingOrganizationPriceOverride.deleteMany({});
    await this.prisma.billingPaymentMethod.deleteMany({});
    await this.prisma.billingAuditLog.deleteMany({});
    await this.prisma.billingInvoice.deleteMany({});
    await this.prisma.billingSubscription.deleteMany({});
    await this.prisma.organizationMembership.deleteMany({});
    await this.prisma.activityLog.deleteMany({});
    await this.prisma.supportTicket.deleteMany({});
    await this.prisma.organization.deleteMany({});
    await this.prisma.user.deleteMany({
      where: { platformRole: { not: 'MASTER_ADMIN' } },
    });
    await this.prisma.dimoVehicle.deleteMany({});
    return { message: 'All organizations, users, vehicles, and prospects removed.' };
  }

  async getRevenueStats() {
    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: { status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] } },
      include: {
        organization: { select: { id: true, companyName: true } },
        invoices: {
          orderBy: { invoiceDate: 'desc' },
          take: 1,
          select: { amountCents: true, status: true },
        },
      },
    });

    const totalMrr = subscriptions.reduce((sum, sub) => {
      const latest = sub.invoices[0];
      return sum + (latest ? latest.amountCents / 100 : 0);
    }, 0);

    const activeCount = subscriptions.filter(
      (s) => s.status === BillingStatus.ACTIVE,
    ).length;
    const trialingCount = subscriptions.filter(
      (s) => s.status === BillingStatus.TRIALING,
    ).length;

    return {
      totalMrr,
      activeSubscriptions: activeCount,
      trialingSubscriptions: trialingCount,
      subscriptionBreakdown: subscriptions.map((sub) => ({
        organizationId: sub.organization.id,
        organizationName: sub.organization.companyName,
        status: sub.status,
        mrr: sub.invoices[0] ? sub.invoices[0].amountCents / 100 : 0,
      })),
    };
  }

  // ── API & Worker Monitoring (Master Admin) ─────────────────────────────

  async getMonitoringSummary(params?: { from?: string; to?: string }) {
    const now = new Date();
    const to = params?.to ? new Date(params.to) : now;
    const from = params?.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      pollLogs,
      pollLogsSuccess,
      pollLogsFailure,
      enrichmentJobs,
      enrichmentPending,
      enrichmentFailed,
      vehicleCount,
      latestStates,
      recentFailures,
    ] = await Promise.all([
      this.prisma.dimoPollLog.findMany({
        where: { startedAt: { gte: from, lte: to } },
        select: { id: true, status: true, durationMs: true, retryCount: true, jobType: true, vehicleId: true },
      }),
      this.prisma.dimoPollLog.count({ where: { startedAt: { gte: from, lte: to }, status: DimoPollStatus.SUCCESS } }),
      this.prisma.dimoPollLog.count({ where: { startedAt: { gte: from, lte: to }, status: { in: [DimoPollStatus.FAILURE, DimoPollStatus.TIMEOUT] } } }),
      this.prisma.vehicleEnrichmentJob.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { id: true, status: true, jobType: true },
      }),
      this.prisma.vehicleEnrichmentJob.count({ where: { status: EnrichmentJobStatus.PENDING } }),
      this.prisma.vehicleEnrichmentJob.count({ where: { status: EnrichmentJobStatus.FAILED } }),
      this.prisma.vehicle.count(),
      this.prisma.vehicleLatestState.findMany({
        select: { vehicleId: true, lastSeenAt: true },
      }),
      this.prisma.dimoPollLog.findMany({
        where: { startedAt: { gte: from, lte: to }, status: { in: [DimoPollStatus.FAILURE, DimoPollStatus.TIMEOUT] } },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { vehicle: { select: { id: true, vehicleName: true, vin: true } } },
      }),
    ]);

    const totalRequests = pollLogs.length;
    const errorRate = totalRequests > 0 ? Math.round((pollLogsFailure / totalRequests) * 100) : 0;
    const avgDurationMs = pollLogs.filter((p) => p.durationMs != null).reduce((s, p) => s + (p.durationMs ?? 0), 0);
    const countWithDuration = pollLogs.filter((p) => p.durationMs != null).length;
    const avgResponseTimeMs = countWithDuration > 0 ? Math.round(avgDurationMs / countWithDuration) : 0;
    const totalRetries = pollLogs.reduce((s, p) => s + (p.retryCount ?? 0), 0);
    const vehiclesPolledRecently = new Set(pollLogs.map((p) => p.vehicleId).filter(Boolean)).size;
    const staleThresholdMs = 30 * 60 * 1000; // 30 min
    const staleVehicles = latestStates.filter((s) => !s.lastSeenAt || (now.getTime() - s.lastSeenAt.getTime() > staleThresholdMs)).length;

    const workerNames = ['DIMO Snapshot', 'DIMO Vehicle Sync', 'DTC Poll', 'V2 Trip Tracking', 'Trip Behavior Enrichment', 'Tire Recalculation'];
    const jobTypeToWorker: Record<string, string> = {
      SNAPSHOT: 'DIMO Snapshot',
      VEHICLE_SYNC: 'DIMO Vehicle Sync',
      DTC_POLL: 'DTC Poll',
      TRIP_TRACKING: 'V2 Trip Tracking',
      TRIP_BEHAVIOR_ENRICHMENT: 'Trip Behavior Enrichment',
      TIRE_RECALCULATION: 'Tire Recalculation',
    };
    const workerStats = workerNames.map((name) => {
      const byJob = pollLogs.filter((p) => jobTypeToWorker[p.jobType] === name);
      const success = byJob.filter((p) => p.status === DimoPollStatus.SUCCESS).length;
      const failed = byJob.filter((p) => p.status === DimoPollStatus.FAILURE || p.status === DimoPollStatus.TIMEOUT).length;
      const total = byJob.length;
      return {
        name,
        total,
        success,
        failed,
        failureRatio: total > 0 ? Math.round((failed / total) * 100) : 0,
        status: total === 0 ? 'idle' : failed > success ? 'degraded' : failed > 0 ? 'warning' : 'healthy',
      };
    });

    const healthyWorkers = workerStats.filter((w) => w.status === 'healthy' || w.status === 'idle').length;
    const unhealthyWorkers = workerStats.filter((w) => w.status === 'degraded').length;
    const delayedOrStuck = enrichmentPending;

    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (errorRate > 20 || unhealthyWorkers > 2 || (recentFailures.length >= 5 && totalRequests > 10)) systemHealth = 'critical';
    else if (errorRate > 5 || unhealthyWorkers > 0 || enrichmentFailed > 0 || staleVehicles > vehicleCount * 0.2) systemHealth = 'warning';

    return {
      totalRequests,
      successfulRequests: pollLogsSuccess,
      failedRequests: pollLogsFailure,
      errorRatePercent: errorRate,
      activeWorkers: workerStats.filter((w) => w.total > 0).length,
      unhealthyWorkers,
      pollingJobsRunning: workerStats.reduce((s, w) => s + w.total, 0),
      delayedOrStuckJobs: delayedOrStuck,
      vehiclesPolledRecently,
      avgResponseTimeMs,
      retryCount: totalRetries,
      staleVehicles,
      systemHealth,
      workers: workerStats,
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        jobType: f.jobType,
        status: f.status,
        errorMessage: f.errorMessage,
        startedAt: f.startedAt.toISOString(),
        vehicleId: f.vehicleId,
        vehicleName: (f as any).vehicle?.vehicleName,
        vin: (f as any).vehicle?.vin,
      })),
    };
  }

  async getMonitoringPollLogs(params: {
    page?: number;
    limit?: number;
    vehicleId?: string;
    jobType?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(10, params.limit ?? 50));
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.vehicleId) where.vehicleId = params.vehicleId;
    if (params.jobType) where.jobType = params.jobType;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.startedAt = {};
      if (params.from) where.startedAt.gte = new Date(params.from);
      if (params.to) where.startedAt.lte = new Date(params.to);
    }
    const [items, total] = await Promise.all([
      this.prisma.dimoPollLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        include: { vehicle: { select: { id: true, vehicleName: true, vin: true } } },
      }),
      this.prisma.dimoPollLog.count({ where }),
    ]);
    return {
      data: items.map((log) => ({
        id: log.id,
        vehicleId: log.vehicleId,
        vehicleName: (log as any).vehicle?.vehicleName,
        vin: (log as any).vehicle?.vin,
        jobType: log.jobType,
        status: log.status,
        startedAt: log.startedAt.toISOString(),
        finishedAt: log.finishedAt?.toISOString() ?? null,
        durationMs: log.durationMs,
        retryCount: log.retryCount,
        errorMessage: log.errorMessage,
        errorCode: log.errorCode,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMonitoringWorkers(params?: { from?: string; to?: string }) {
    const now = new Date();
    const from = params?.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = params?.to ? new Date(params.to) : now;
    const pollLogs = await this.prisma.dimoPollLog.findMany({
      where: { startedAt: { gte: from, lte: to } },
      select: { jobType: true, status: true, durationMs: true, retryCount: true, startedAt: true },
    });
    const jobTypeToWorker: Record<string, { name: string; description: string }> = {
      SNAPSHOT: { name: 'DIMO Snapshot', description: 'Polls 30s telemetry snapshot (speed, fuel, odometer, etc.)' },
      VEHICLE_SYNC: { name: 'DIMO Vehicle Sync', description: 'Syncs vehicle list from DIMO (manual trigger)' },
      DTC_POLL: { name: 'DTC Poll', description: 'Polls diagnostic trouble codes every 3h' },
      TRIP_TRACKING: { name: 'V2 Trip Tracking', description: 'Per-vehicle dynamic trip detection + tracking' },
      TRIP_BEHAVIOR_ENRICHMENT: { name: 'Trip Behavior Enrichment', description: 'Post-trip high-frequency behavior analysis' },
      TIRE_RECALCULATION: { name: 'Tire Recalculation', description: 'Hourly tire wear recalculation' },
    };
    const workers = Object.entries(jobTypeToWorker).map(([key, meta]) => ({
      queueKey: key,
      ...meta,
    }));

    return workers.map((w) => {
      const jobType = w.queueKey as string;
      const logs = pollLogs.filter((p) => p.jobType === jobType);
      const total = logs.length;
      const success = logs.filter((p) => p.status === DimoPollStatus.SUCCESS).length;
      const failed = logs.filter((p) => p.status === DimoPollStatus.FAILURE || p.status === DimoPollStatus.TIMEOUT).length;
      const withDuration = logs.filter((p) => p.durationMs != null);
      const avgDurationMs = withDuration.length
        ? Math.round(withDuration.reduce((s, p) => s + (p.durationMs ?? 0), 0) / withDuration.length)
        : 0;
      const totalRetries = logs.reduce((s, p) => s + (p.retryCount ?? 0), 0);
      const lastS = logs.filter((p) => p.status === DimoPollStatus.SUCCESS).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
      const lastF = logs.filter((p) => p.status === DimoPollStatus.FAILURE || p.status === DimoPollStatus.TIMEOUT).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
      const lastSuccessAt = lastS ? lastS.startedAt.toISOString() : null;
      const lastFailedAt = lastF ? lastF.startedAt.toISOString() : null;
      const failureRatio = total > 0 ? Math.round((failed / total) * 100) : 0;
      let status: 'healthy' | 'busy' | 'idle' | 'warning' | 'degraded' | 'failed' | 'offline' = 'idle';
      if (total === 0) status = 'idle';
      else if (failureRatio >= 50) status = 'degraded';
      else if (failureRatio > 0) status = 'warning';
      else status = 'healthy';
      return {
        ...w,
        total,
        success,
        failed,
        failureRatio,
        lastSuccessAt,
        lastFailedAt,
        avgDurationMs,
        totalRetries,
        status,
      };
    });
  }

  async getMonitoringAlerts(params?: { from?: string; to?: string }) {
    const now = new Date();
    const from = params?.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = params?.to ? new Date(params.to) : now;
    const summary = await this.getMonitoringSummary({ from: from.toISOString(), to: to.toISOString() });
    const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; title: string; summary: string; affectedComponent?: string; firstSeen: string; lastSeen: string }> = [];
    if (summary.errorRatePercent > 20) {
      alerts.push({
        severity: 'critical',
        title: 'High error rate',
        summary: `${summary.errorRatePercent}% of API requests failed in the selected period.`,
        affectedComponent: 'Polling',
        firstSeen: from.toISOString(),
        lastSeen: to.toISOString(),
      });
    } else if (summary.errorRatePercent > 5) {
      alerts.push({
        severity: 'warning',
        title: 'Elevated error rate',
        summary: `${summary.errorRatePercent}% of requests failed. Consider checking provider and tokens.`,
        affectedComponent: 'Polling',
        firstSeen: from.toISOString(),
        lastSeen: to.toISOString(),
      });
    }
    if (summary.unhealthyWorkers > 0) {
      alerts.push({
        severity: summary.unhealthyWorkers > 2 ? 'critical' : 'warning',
        title: 'Unhealthy workers',
        summary: `${summary.unhealthyWorkers} worker(s) have high failure rates.`,
        affectedComponent: 'Workers',
        firstSeen: from.toISOString(),
        lastSeen: to.toISOString(),
      });
    }
    if (summary.delayedOrStuckJobs > 10) {
      alerts.push({
        severity: 'warning',
        title: 'Delayed or stuck jobs',
        summary: `${summary.delayedOrStuckJobs} enrichment jobs are pending.`,
        affectedComponent: 'Workers',
        firstSeen: from.toISOString(),
        lastSeen: to.toISOString(),
      });
    }
    if (summary.staleVehicles > 0 && summary.vehiclesPolledRecently > 0) {
      alerts.push({
        severity: summary.staleVehicles > 5 ? 'warning' : 'info',
        title: 'Stale vehicles',
        summary: `${summary.staleVehicles} vehicle(s) have not received data within the expected interval.`,
        affectedComponent: 'Polling',
        firstSeen: from.toISOString(),
        lastSeen: to.toISOString(),
      });
    }
    summary.recentFailures.slice(0, 3).forEach((f) => {
      alerts.push({
        severity: 'warning',
        title: `Poll failure: ${f.jobType}`,
        summary: f.errorMessage || 'No message',
        affectedComponent: f.vehicleName || f.vehicleId || 'Unknown',
        firstSeen: f.startedAt,
        lastSeen: f.startedAt,
      });
    });
    return alerts.slice(0, 20);
  }

  async getChangelogs(module?: string) {
    const where: any = {};
    if (module) where.module = module;
    return this.prisma.platformChangelog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createChangelog(data: {
    version: string;
    title: string;
    summary: string[];
    reason?: string;
    previousBehavior?: string;
    details?: string;
    affectsArchitecture?: boolean;
    module?: string;
  }) {
    return this.prisma.platformChangelog.create({ data });
  }
}

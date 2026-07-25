import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';

const DEFAULT_RETENTION_DAYS = {
  resolvedNotifications: 180,
  archivedInsights: 90,
  resolvedComplaints: 365,
  expiredFindings: 180,
};

function retentionDays(envKey: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[envKey] ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoffDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface VehicleWarningRetentionReport {
  status: 'completed' | 'stub';
  trigger: string;
  deleted: Record<string, number>;
}

/**
 * Fleet warning artefact retention (VW-F-019 / WP-16).
 * Enabled via VEHICLE_WARNING_RETENTION_ENABLED=true.
 */
@Injectable()
export class VehicleWarningRetentionScheduler {
  private readonly logger = new Logger(VehicleWarningRetentionScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async scheduledRun(): Promise<void> {
    if (process.env.VEHICLE_WARNING_RETENTION_ENABLED !== 'true') {
      this.logger.debug(
        'Vehicle warning retention skipped (VEHICLE_WARNING_RETENTION_ENABLED!=true)',
      );
      return;
    }
    await this.runOnce('cron');
  }

  async runOnce(
    trigger: 'cron' | 'manual' = 'manual',
  ): Promise<VehicleWarningRetentionReport> {
    if (process.env.VEHICLE_WARNING_RETENTION_ENABLED !== 'true') {
      return { status: 'stub', trigger, deleted: {} };
    }

    const deleted: Record<string, number> = {};
    const batchSize = 500;

    const notificationDays = retentionDays(
      'VEHICLE_WARNING_RETENTION_NOTIFICATIONS_DAYS',
      DEFAULT_RETENTION_DAYS.resolvedNotifications,
    );
    const insightDays = retentionDays(
      'VEHICLE_WARNING_RETENTION_INSIGHTS_DAYS',
      DEFAULT_RETENTION_DAYS.archivedInsights,
    );
    const complaintDays = retentionDays(
      'VEHICLE_WARNING_RETENTION_COMPLAINTS_DAYS',
      DEFAULT_RETENTION_DAYS.resolvedComplaints,
    );
    const findingDays = retentionDays(
      'VEHICLE_WARNING_RETENTION_FINDINGS_DAYS',
      DEFAULT_RETENTION_DAYS.expiredFindings,
    );

    const resolvedNotif = await this.prisma.notification.deleteMany({
      where: {
        status: { in: ['RESOLVED', 'ARCHIVED'] },
        resolvedAt: { lt: cutoffDate(notificationDays) },
      },
    });
    deleted.notifications = resolvedNotif.count;

    const inactiveInsights = await this.prisma.dashboardInsight.deleteMany({
      where: {
        isActive: false,
        updatedAt: { lt: cutoffDate(insightDays) },
      },
    });
    deleted.dashboardInsights = inactiveInsights.count;

    const resolvedComplaints = await this.prisma.vehicleComplaint.deleteMany({
      where: {
        status: { in: ['RESOLVED', 'DISMISSED'] },
        OR: [
          { resolvedAt: { lt: cutoffDate(complaintDays) } },
          { dismissedAt: { lt: cutoffDate(complaintDays) } },
        ],
      },
    });
    deleted.vehicleComplaints = resolvedComplaints.count;

    const terminalFindings = await this.prisma.vehicleFinding.deleteMany({
      where: {
        status: { in: ['RESOLVED', 'EXPIRED', 'SUPERSEDED'] },
        resolvedAt: { lt: cutoffDate(findingDays) },
      },
    });
    deleted.vehicleFindings = terminalFindings.count;

    this.logger.log(
      `Vehicle warning retention (${trigger}): ${JSON.stringify(deleted)} batch<=${batchSize}`,
    );
    return { status: 'completed', trigger, deleted };
  }
}

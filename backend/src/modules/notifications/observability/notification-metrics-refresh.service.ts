import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

const OPEN_STATUSES: NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
];

/**
 * Refreshes notification gauges/histograms that require DB aggregation.
 * organizationId is never used as a metric label.
 */
@Injectable()
export class NotificationMetricsRefreshService {
  private readonly logger = new Logger(NotificationMetricsRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: TripMetricsService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshOpenAgeHistogram(): Promise<void> {
    try {
      const now = Date.now();
      const rows = await this.prisma.notification.findMany({
        where: { status: { in: OPEN_STATUSES } },
        select: { severity: true, firstSeenAt: true },
        take: 5000,
        orderBy: { firstSeenAt: 'asc' },
      });

      for (const row of rows) {
        const ageSeconds = Math.max(0, (now - row.firstSeenAt.getTime()) / 1000);
        this.metrics.notificationOpenAge.observe(
          { severity: row.severity },
          ageSeconds,
        );
      }
    } catch (err: unknown) {
      this.logger.debug(
        `Notification open-age refresh skipped: ${(err as Error).message}`,
      );
    }
  }
}

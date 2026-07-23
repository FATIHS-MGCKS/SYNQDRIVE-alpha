import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BookingProcessingFailureRepository } from './booking-processing-failure.repository';

@Injectable()
export class BookingObservabilityMonitoringScheduler {
  private readonly logger = new Logger(BookingObservabilityMonitoringScheduler.name);

  constructor(
    private readonly failures: BookingProcessingFailureRepository,
    private readonly metrics: TripMetricsService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshAlertGauges(): Promise<void> {
    try {
      const staleBefore = new Date(Date.now() - 30 * 60_000);
      const grouped = await this.failures.countUnresolvedByCategory(staleBefore);
      for (const row of grouped) {
        this.metrics.setBookingProcessingFailureGauge(row.category, row._count._all);
      }

      const windowStart = new Date(Date.now() - 15 * 60_000);
      const conflicts = await this.failures.countConflicts(windowStart);
      this.metrics.setBookingConflictRateGauge(conflicts);

      const tenantDenials = await this.failures.countTenantDenials(windowStart);
      this.metrics.setBookingTenantDenialGauge(tenantDenials);
    } catch (err) {
      this.logger.warn({
        msg: 'booking.observability.refresh_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

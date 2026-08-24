import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { CommunicationOperationalHealthRepository } from './communication-operational-health.repository';
import { refreshCommunicationSendUnknownGauges } from './communication-prometheus.metrics';

/**
 * Refreshes Communication gauges that require DB aggregation.
 * organizationId is never used as a metric label.
 */
@Injectable()
export class CommunicationMetricsRefreshService {
  private readonly logger = new Logger(CommunicationMetricsRefreshService.name);

  constructor(
    private readonly repository: CommunicationOperationalHealthRepository,
    private readonly metrics: TripMetricsService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshGauges(): Promise<void> {
    try {
      const unknownByChannel = await this.repository.getUnknownSendSignalsByChannel(
        undefined,
        new Date(),
      );
      refreshCommunicationSendUnknownGauges(this.metrics, unknownByChannel.byChannel);
    } catch (err: unknown) {
      const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.logger.debug(`communication_metrics_refresh_failed errorClass=${errorClass}`);
    }
  }
}

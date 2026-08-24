import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { CommunicationOperationalHealthService } from './communication-operational-health.service';
import {
  setCommunicationSendUnknownCurrent,
  setCommunicationSendUnknownOldestSeconds,
} from './communication-prometheus.metrics';

/**
 * Refreshes Communication gauges that require DB aggregation.
 * organizationId is never used as a metric label.
 */
@Injectable()
export class CommunicationMetricsRefreshService {
  private readonly logger = new Logger(CommunicationMetricsRefreshService.name);

  constructor(
    private readonly healthService: CommunicationOperationalHealthService,
    private readonly metrics: TripMetricsService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshGauges(): Promise<void> {
    try {
      const snapshot = await this.healthService.evaluate();
      const outbound = snapshot.components.outbound;
      const unknownCount = Number(outbound.signals.unknownSendCountBounded ?? 0);
      const oldestAge = outbound.signals.unknownSendOldestAgeSeconds;
      setCommunicationSendUnknownCurrent(this.metrics, 'whatsapp', unknownCount);
      setCommunicationSendUnknownOldestSeconds(
        this.metrics,
        'whatsapp',
        typeof oldestAge === 'number' ? oldestAge : null,
      );
    } catch (err: unknown) {
      this.logger.debug(
        `Communication metrics refresh skipped: ${(err as Error).message}`,
      );
    }
  }
}

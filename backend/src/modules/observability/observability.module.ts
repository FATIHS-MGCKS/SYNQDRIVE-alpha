import { Global, Module } from '@nestjs/common';
import { TripMetricsService } from './trip-metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsAuthGuard } from './metrics-auth.guard';
import { MetricsRefreshService } from './metrics-refresh.service';
import { QueueMonitoringService } from './queue-monitoring.service';

/**
 * ObservabilityModule
 *
 * Global module providing TripMetricsService to the whole application.
 * Exposes the protected Prometheus /metrics endpoint via MetricsController.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [TripMetricsService, MetricsAuthGuard, MetricsRefreshService, QueueMonitoringService],
  exports: [TripMetricsService, QueueMonitoringService],
})
export class ObservabilityModule {}

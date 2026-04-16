import { Global, Module } from '@nestjs/common';
import { TripMetricsService } from './trip-metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * ObservabilityModule
 *
 * Global module providing TripMetricsService to the whole application.
 * Exposes the Prometheus /metrics endpoint via MetricsController.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [TripMetricsService],
  exports: [TripMetricsService],
})
export class ObservabilityModule {}

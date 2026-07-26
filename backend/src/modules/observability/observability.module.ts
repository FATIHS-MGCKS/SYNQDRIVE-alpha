import { Global, Module } from '@nestjs/common';
import { RedisModule } from '@shared/redis/redis.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { TripMetricsService } from './trip-metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsAuthGuard } from './metrics-auth.guard';
import { MetricsRefreshService } from './metrics-refresh.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { VoiceMetricsService } from './voice-metrics.service';
import { WorkerObservabilityModule } from '@modules/worker-observability/worker-observability.module';

/**
 * ObservabilityModule
 *
 * Global module providing TripMetricsService to the whole application.
 * Exposes the protected Prometheus /metrics endpoint via MetricsController.
 */
@Global()
@Module({
  imports: [PrismaModule, RedisModule, WorkerObservabilityModule],
  controllers: [MetricsController],
  providers: [TripMetricsService, MetricsAuthGuard, MetricsRefreshService, QueueMonitoringService, VoiceMetricsService],
  exports: [TripMetricsService, QueueMonitoringService, VoiceMetricsService],
})
export class ObservabilityModule {}

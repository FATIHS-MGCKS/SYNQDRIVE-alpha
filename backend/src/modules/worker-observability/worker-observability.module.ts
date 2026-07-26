import { Global, Module } from '@nestjs/common';
import { WorkerObservabilityMetrics } from './worker-observability.metrics';
import { WorkerQueueEventsService } from './worker-queue-events.service';
import { SchedulerObservabilityService } from './scheduler-observability.service';

@Global()
@Module({
  providers: [
    WorkerObservabilityMetrics,
    WorkerQueueEventsService,
    SchedulerObservabilityService,
  ],
  exports: [WorkerObservabilityMetrics, SchedulerObservabilityService],
})
export class WorkerObservabilityModule {}

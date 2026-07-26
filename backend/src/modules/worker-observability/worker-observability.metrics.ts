import { Injectable } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  registerWorkerObservabilityMetrics,
  type WorkerObservabilityMetricHandles,
} from './worker-prometheus.metrics';

@Injectable()
export class WorkerObservabilityMetrics {
  readonly handles: WorkerObservabilityMetricHandles;

  constructor(tripMetrics: TripMetricsService) {
    this.handles = registerWorkerObservabilityMetrics(tripMetrics.registry);
  }

  recordEnqueueDuplicate(queue: string, reason: 'job_id_exists' | 'inflight' | 'deduplicated'): void {
    this.handles.queueEnqueueDuplicateTotal.inc({ queue, reason });
  }

  recordSchedulerSuccess(scheduler: string, durationSec: number): void {
    this.handles.schedulerLastSuccessUnix.set({ scheduler }, Date.now() / 1000);
    this.handles.schedulerRunDurationSeconds.observe({ scheduler }, durationSec);
  }

  recordSchedulerFailure(scheduler: string, durationSec: number): void {
    this.handles.schedulerFailuresTotal.inc({ scheduler });
    this.handles.schedulerRunDurationSeconds.observe({ scheduler }, durationSec);
  }
}

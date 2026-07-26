import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface WorkerObservabilityMetricHandles {
  queueWaitingJobs: Gauge<string>;
  queueActiveJobs: Gauge<string>;
  queueDelayedJobs: Gauge<string>;
  queueJobDurationSeconds: Histogram<string>;
  queueJobsProcessedTotal: Counter<string>;
  queueJobRetriesTotal: Counter<string>;
  queueJobsStalledTotal: Counter<string>;
  queueEnqueueDuplicateTotal: Counter<string>;
  schedulerLastSuccessUnix: Gauge<string>;
  schedulerRunDurationSeconds: Histogram<string>;
  schedulerFailuresTotal: Counter<string>;
}

export function registerWorkerObservabilityMetrics(
  registry: Registry,
): WorkerObservabilityMetricHandles {
  return {
    queueWaitingJobs: new Gauge({
      name: 'synqdrive_queue_waiting_jobs',
      help: 'Current waiting BullMQ jobs per queue',
      labelNames: ['queue'],
      registers: [registry],
    }),
    queueActiveJobs: new Gauge({
      name: 'synqdrive_queue_active_jobs',
      help: 'Current active BullMQ jobs per queue',
      labelNames: ['queue'],
      registers: [registry],
    }),
    queueDelayedJobs: new Gauge({
      name: 'synqdrive_queue_delayed_jobs',
      help: 'Current delayed BullMQ jobs per queue',
      labelNames: ['queue'],
      registers: [registry],
    }),
    queueJobDurationSeconds: new Histogram({
      name: 'synqdrive_queue_job_duration_seconds',
      help: 'BullMQ job processor duration in seconds (processedOn → finishedOn)',
      labelNames: ['queue', 'result'],
      buckets: [0.1, 0.5, 1, 2, 5, 15, 30, 60, 120, 300, 600],
      registers: [registry],
    }),
    queueJobsProcessedTotal: new Counter({
      name: 'synqdrive_queue_jobs_processed_total',
      help: 'BullMQ jobs completed or failed after processing',
      labelNames: ['queue', 'result'],
      registers: [registry],
    }),
    queueJobRetriesTotal: new Counter({
      name: 'synqdrive_queue_job_retries_total',
      help: 'BullMQ job failures that will be retried (attemptsMade < max attempts)',
      labelNames: ['queue'],
      registers: [registry],
    }),
    queueJobsStalledTotal: new Counter({
      name: 'synqdrive_queue_jobs_stalled_total',
      help: 'BullMQ stalled job events per queue',
      labelNames: ['queue'],
      registers: [registry],
    }),
    queueEnqueueDuplicateTotal: new Counter({
      name: 'synqdrive_queue_enqueue_duplicate_total',
      help: 'Enqueue attempts deduplicated or skipped due to existing jobId',
      labelNames: ['queue', 'reason'],
      registers: [registry],
    }),
    schedulerLastSuccessUnix: new Gauge({
      name: 'synqdrive_scheduler_last_success_timestamp',
      help: 'Unix timestamp of last successful scheduler run',
      labelNames: ['scheduler'],
      registers: [registry],
    }),
    schedulerRunDurationSeconds: new Histogram({
      name: 'synqdrive_scheduler_run_duration_seconds',
      help: 'Scheduler tick duration in seconds',
      labelNames: ['scheduler'],
      buckets: [0.05, 0.1, 0.5, 1, 5, 15, 60, 300, 900],
      registers: [registry],
    }),
    schedulerFailuresTotal: new Counter({
      name: 'synqdrive_scheduler_failures_total',
      help: 'Scheduler tick failures',
      labelNames: ['scheduler'],
      registers: [registry],
    }),
  };
}

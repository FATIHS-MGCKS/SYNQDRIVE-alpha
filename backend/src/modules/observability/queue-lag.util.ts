import type { Job } from 'bullmq';
import type { TripMetricsService } from './trip-metrics.service';

/** Records BullMQ queue lag in seconds when a worker starts processing a job. */
export function observeQueueLag(
  metrics: TripMetricsService | undefined,
  queueName: string,
  job: Job,
): void {
  if (!metrics) return;

  const createdMs =
    typeof job.timestamp === 'number' && Number.isFinite(job.timestamp)
      ? job.timestamp
      : Date.now();
  const lagSec = Math.max(0, (Date.now() - createdMs) / 1000);
  metrics.queueLag.observe({ queue: queueName }, lagSec);
}

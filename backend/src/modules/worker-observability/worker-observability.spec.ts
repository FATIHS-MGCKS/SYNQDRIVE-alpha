import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { registerWorkerObservabilityMetrics } from './worker-prometheus.metrics';
import { ALL_WORKER_QUEUES } from './worker-queue-catalog';

describe('WorkerObservabilityMetrics', () => {
  it('registers worker queue and scheduler metrics on shared registry', async () => {
    const tripMetrics = new TripMetricsService();
    registerWorkerObservabilityMetrics(tripMetrics.registry);
    const text = await tripMetrics.getMetrics();
    expect(text).toContain('synqdrive_queue_waiting_jobs');
    expect(text).toContain('synqdrive_queue_active_jobs');
    expect(text).toContain('synqdrive_queue_delayed_jobs');
    expect(text).toContain('synqdrive_queue_job_duration_seconds');
    expect(text).toContain('synqdrive_queue_jobs_processed_total');
    expect(text).toContain('synqdrive_queue_job_retries_total');
    expect(text).toContain('synqdrive_queue_jobs_stalled_total');
    expect(text).toContain('synqdrive_queue_enqueue_duplicate_total');
    expect(text).toContain('synqdrive_scheduler_last_success_timestamp');
    expect(text).toContain('synqdrive_scheduler_run_duration_seconds');
    expect(text).toContain('synqdrive_scheduler_failures_total');
  });

  it('covers all BullMQ queue names in catalog', () => {
    expect(ALL_WORKER_QUEUES.length).toBeGreaterThanOrEqual(18);
    expect(ALL_WORKER_QUEUES).toContain('document.extraction');
    expect(ALL_WORKER_QUEUES).toContain('dimo.snapshot.poll');
  });
});

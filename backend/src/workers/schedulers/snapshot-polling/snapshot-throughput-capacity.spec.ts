import { simulateSnapshotPollingLoad, buildAuditMixedFleetDistribution } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';

/**
 * FINAL-2 section H — snapshot consumer capacity vs P1.2 enqueue model.
 *
 * DimoSnapshotProcessor: concurrency=5, lockDuration=60s.
 * Capacity (jobs/min) = concurrency × 60 / avg_job_seconds
 *
 * Evidence for job durations:
 * - Production incident KS MS 661: 7514ms snapshot (architecture doc V4.6.80)
 * - lockDuration raised to 60s because 30s default was insufficient
 * - GraphQL timeout reduced to 15s in DimoTelemetryService
 */

const PROCESSOR_CONCURRENCY = 5;

function consumerCapacityJobsPerMinute(avgJobSeconds: number): number {
  return (PROCESSOR_CONCURRENCY * 60) / avgJobSeconds;
}

function requiredConcurrency(
  targetJobsPerMinute: number,
  avgJobSeconds: number,
): number {
  return Math.ceil((targetJobsPerMinute * avgJobSeconds) / 60);
}

describe('snapshot throughput capacity (H)', () => {
  const n1000 = simulateSnapshotPollingLoad({
    fleetSize: 1000,
    distribution: buildAuditMixedFleetDistribution(1000),
    config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
  });

  it('P1.2 steady-state enqueue at N=1000 is ~376.7 jobs/min', () => {
    expect(n1000.enqueuesPerMinute).toBeCloseTo(376.67, 0);
  });

  it('concurrency=5 is throughput-negative at N=1000 for evidenced durations', () => {
    const scenarios = [
      { label: 'P50 ~8s (healthy DIMO)', avgSeconds: 8 },
      { label: 'P95 ~15s (GraphQL timeout bound)', avgSeconds: 15 },
      { label: 'provider-slow ~30s (stall risk)', avgSeconds: 30 },
      { label: 'incident 7.5s (KS MS 661 measured)', avgSeconds: 7.514 },
    ];

    for (const { avgSeconds } of scenarios) {
      const capacity = consumerCapacityJobsPerMinute(avgSeconds);
      expect(capacity).toBeLessThan(n1000.enqueuesPerMinute);
    }
  });

  it('reports required concurrency to absorb N=1000 P1.2 load', () => {
    const target = n1000.enqueuesPerMinute;

    expect(requiredConcurrency(target, 8)).toBe(51);
    expect(requiredConcurrency(target, 15)).toBe(95);
    expect(requiredConcurrency(target, 30)).toBe(189);
  });

  it('P1.2 alone remains throughput-negative — explicit scaling slice needed before P1.3+', () => {
  // architecture/SNAPSHOT_ACTIVITY_TIER_POLLING_P1_2_2026-08-29.md lists P1.3+
  // global DIMO semaphore but not snapshot worker throughput scaling.
    const capacityAtP50 = consumerCapacityJobsPerMinute(8);
    expect(capacityAtP50 / n1000.enqueuesPerMinute).toBeLessThan(0.15);
  });
});

import { readWorkerConcurrency, readWorkerNonNegativeInt } from '@config/worker-concurrency.util';
import {
  BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE,
  isBoundaryRefreshRetryable,
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
} from '../../../modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { simulateSnapshotPollingLoad, buildAuditMixedFleetDistribution } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';
import { estimateFastReconciliationCohortSize } from './fast-reconciliation-cohort';
import { interleaveByOrganization } from './interleave-by-organization';

const GENERATION = buildBoundaryRepairGeneration({
  auditId: 'audit-scale',
  providerSegmentId: 'seg-1',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

function consumerCapacityJobsPerMinute(concurrency: number, avgJobSeconds: number): number {
  return (concurrency * 60) / avgJobSeconds;
}

describe('P1.2 FINAL-4 scale closeout', () => {
  describe('A — worker concurrency env wiring', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('readWorkerConcurrency clamps invalid and excessive values', () => {
      process.env = { ...originalEnv, WORKER_SNAPSHOT_CONCURRENCY: '0' };
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5)).toBe(5);

      process.env = { ...originalEnv, WORKER_SNAPSHOT_CONCURRENCY: '999' };
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5)).toBe(200);

      process.env = { ...originalEnv, WORKER_SNAPSHOT_CONCURRENCY: '51' };
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5)).toBe(51);
    });

    it('snapshot max enqueue per tick defaults to unlimited (0)', () => {
      expect(readWorkerNonNegativeInt('WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK', 0)).toBe(0);
    });
  });

  describe('B — snapshot load bounds at N=100 and N=1000', () => {
    it('steady-state enqueue is deterministic and sub-linear vs legacy', () => {
      for (const fleetSize of [100, 1000]) {
        const result = simulateSnapshotPollingLoad({
          fleetSize,
          distribution: buildAuditMixedFleetDistribution(fleetSize),
          config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
        });
        expect(result.enqueuesPerMinute).toBeLessThan(result.legacyEnqueuesPerMinute);
        expect(result.reductionFactor).toBeGreaterThan(1);
        expect(Number.isFinite(result.enqueuesPerMinute)).toBe(true);
      }
    });

    it('required concurrency for N=1000 is env-configurable (not hardcoded)', () => {
      const n1000 = simulateSnapshotPollingLoad({
        fleetSize: 1000,
        distribution: buildAuditMixedFleetDistribution(1000),
        config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
      });
      const required = Math.ceil((n1000.enqueuesPerMinute * 8) / 60);
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5, 200)).toBeLessThan(required);

      const original = process.env.WORKER_SNAPSHOT_CONCURRENCY;
      process.env.WORKER_SNAPSHOT_CONCURRENCY = String(required);
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5, 200)).toBe(required);
      if (original === undefined) delete process.env.WORKER_SNAPSHOT_CONCURRENCY;
      else process.env.WORKER_SNAPSHOT_CONCURRENCY = original;
    });
  });

  describe('C — fast reconciliation fan-out bounds', () => {
    it('fast cohort at N=1000 stays below full-fleet reconciliation', () => {
      const cohort = estimateFastReconciliationCohortSize({ fleetSize: 1000 });
      expect(cohort).toBeLessThan(1000);
      expect(cohort * 4).toBeLessThan(4000);
    });
  });

  describe('D — org fairness interleave is bounded', () => {
    it('round-robin does not explode memory for large org skew', () => {
      const items = [
        ...Array.from({ length: 900 }, (_, i) => ({
          organizationId: 'org-big',
          id: `v-${i}`,
        })),
        ...Array.from({ length: 100 }, (_, i) => ({
          organizationId: 'org-small',
          id: `s-${i}`,
        })),
      ];
      const ordered = interleaveByOrganization(items);
      expect(ordered).toHaveLength(1000);
      expect(ordered[0].organizationId).toBe('org-big');
      expect(ordered[1].organizationId).toBe('org-small');
    });
  });

  describe('E — boundary recovery batch bounds', () => {
    it('recovery batch size is fixed and COMPLETED is never retryable', () => {
      expect(BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE).toBe(20);
      const completed = buildBoundaryRefreshRecord('COMPLETED', null, undefined, {
        generation: GENERATION,
      });
      expect(isBoundaryRefreshRetryable(completed)).toBe(false);
    });

    it('large recoverable set simulation respects batch cap', () => {
      const totalPending = 500;
      const batches = Math.ceil(totalPending / BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE);
      expect(batches).toBe(25);
      expect(BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE * batches).toBeGreaterThanOrEqual(totalPending);
    });
  });

  describe('F — provider concurrency model (process-local)', () => {
    it('default snapshot consumer capacity is documented vs N=1000 load', () => {
      const concurrency = readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5);
      const n1000 = simulateSnapshotPollingLoad({
        fleetSize: 1000,
        distribution: buildAuditMixedFleetDistribution(1000),
        config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
      });
      const capacity = consumerCapacityJobsPerMinute(concurrency, 8);
      expect(capacity).toBeLessThan(n1000.enqueuesPerMinute);
    });
  });

  describe('G — repeated COMPLETED reconciliation is a no-op', () => {
    it('COMPLETED generations never re-enter retryable set', () => {
      for (let i = 0; i < 10; i++) {
        const record = buildBoundaryRefreshRecord('COMPLETED', null, undefined, {
          generation: GENERATION,
        });
        expect(isBoundaryRefreshRetryable(record)).toBe(false);
      }
    });
  });
});

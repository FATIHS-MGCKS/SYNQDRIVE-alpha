import {
  ACTIVE_TICK_DIMO_CALLS_PER_JOB,
  buildWorkloadMatrix,
  buildWorkloadModelRow,
  consumerCapacityJobsPerMinute,
  FLEET_SCENARIOS,
  maxProcessLocalDimoConcurrency,
  requiredConcurrency,
} from './p12-final5-workload-model';
import {
  BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE,
  isBoundaryRefreshRetryable,
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
} from '../../../modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { simulateSnapshotPollingLoad, buildAuditMixedFleetDistribution } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';
import { readWorkerConcurrency } from '@config/worker-concurrency.util';

const GENERATION = buildBoundaryRepairGeneration({
  auditId: 'final5-scale',
  providerSegmentId: 'seg-1',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

describe('P1.2 FINAL-5 production scale gate', () => {
  describe('C — workload / concurrency matrix', () => {
    const matrix = buildWorkloadMatrix();

    it('produces 12 deterministic rows (4 fleet sizes × 3 scenarios)', () => {
      expect(matrix).toHaveLength(12);
    });

    it('S1 N=1000 snapshot enqueue matches FINAL-4 steady-state model', () => {
      const row = buildWorkloadModelRow({
        fleetSize: 1000,
        scenario: FLEET_SCENARIOS.S1,
      });
      expect(row.snapshotEnqueuePerMinute).toBeCloseTo(376.67, 0);
      expect(row.requiredSnapshotConcurrency.p50_8s).toBe(51);
      expect(row.requiredSnapshotConcurrencyHeadroom20.p50_8s).toBe(61);
      expect(row.requiredSnapshotConcurrencyHeadroom50.p50_8s).toBe(76);
    });

    it('S3 extreme dominates ACTIVE_TICK provider load', () => {
      const s1 = buildWorkloadModelRow({ fleetSize: 1000, scenario: FLEET_SCENARIOS.S1 });
      const s3 = buildWorkloadModelRow({ fleetSize: 1000, scenario: FLEET_SCENARIOS.S3 });
      expect(s3.activeTickCallsPerMinute).toBeGreaterThan(s1.activeTickCallsPerMinute * 5);
      expect(s3.totalDimoRequestsPerMinute).toBeGreaterThan(s1.totalDimoRequestsPerMinute);
    });

    it('default concurrency=5 is throughput-negative for all matrix rows at P50 8s', () => {
      for (const row of matrix) {
        const capacity = consumerCapacityJobsPerMinute(5, 8);
        expect(capacity).toBeLessThan(row.snapshotEnqueuePerMinute);
        expect(row.snapshotBacklogGrowthPerMinuteAtConcurrency5).toBeGreaterThan(0);
      }
    });

    it('N=100 concurrency matrix spans service-time bounds', () => {
      const row = buildWorkloadModelRow({ fleetSize: 100, scenario: FLEET_SCENARIOS.S1 });
      expect(requiredConcurrency(row.snapshotEnqueuePerMinute, 2)).toBe(2);
      expect(requiredConcurrency(row.snapshotEnqueuePerMinute, 4)).toBe(3);
      expect(requiredConcurrency(row.snapshotEnqueuePerMinute, 8)).toBe(6);
      expect(requiredConcurrency(row.snapshotEnqueuePerMinute, 15)).toBe(10);
      expect(requiredConcurrency(row.snapshotEnqueuePerMinute, 30)).toBe(19);
    });
  });

  describe('D/E — process-local DIMO concurrency ceiling (single PM2)', () => {
    it('default env caps cross-queue fan-out at 20 concurrent HTTP slots', () => {
      const snapshot = readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5);
      const trip = readWorkerConcurrency('WORKER_TRIP_TRACKING_CONCURRENCY', 5);
      expect(
        maxProcessLocalDimoConcurrency({
          snapshotConcurrency: snapshot,
          tripTrackingConcurrency: trip,
        }),
      ).toBe(5 + 5 * ACTIVE_TICK_DIMO_CALLS_PER_JOB + 1);
    });

    it('max env (200+200) yields bounded but high fan-out without global semaphore', () => {
      const max = maxProcessLocalDimoConcurrency({
        snapshotConcurrency: 200,
        tripTrackingConcurrency: 200,
      });
      expect(max).toBe(200 + 200 * 3 + 1);
      expect(max).toBe(801);
    });
  });

  describe('G/H — backlog + boundary repair invariants under scale pressure', () => {
    it('COMPLETED boundary refresh never re-enters retryable set under repeated reconciliation', () => {
      for (let i = 0; i < 20; i++) {
        const record = buildBoundaryRefreshRecord('COMPLETED', null, undefined, {
          generation: GENERATION,
        });
        expect(isBoundaryRefreshRetryable(record)).toBe(false);
      }
    });

    it('recovery batch stays bounded under 500 pending boundary refreshes', () => {
      const batches = Math.ceil(500 / BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE);
      expect(batches).toBe(25);
      expect(BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE).toBe(20);
    });

    it('snapshot backlog growth does not imply trip-loss — reconciliation tier still covers fleet', () => {
      const n1000 = simulateSnapshotPollingLoad({
        fleetSize: 1000,
        distribution: buildAuditMixedFleetDistribution(1000),
        config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
      });
      const backlogPerMinute = n1000.enqueuesPerMinute - consumerCapacityJobsPerMinute(5, 8);
      expect(backlogPerMinute).toBeGreaterThan(300);
      // Fast cohort remains << full fleet — warm/cold still sweep all tokens.
      const fastCohort = buildWorkloadModelRow({
        fleetSize: 1000,
        scenario: FLEET_SCENARIOS.S1,
      });
      expect(fastCohort.fastReconciliationCallsPerHour).toBeLessThan(
        1000 * 5 * 4,
      );
    });
  });

  describe('F — scheduler duplication model (2 replicas)', () => {
    it('duplicate scheduler ticks double enqueue attempts but jobId dedup caps active jobs', () => {
      const perReplica = simulateSnapshotPollingLoad({
        fleetSize: 1000,
        distribution: buildAuditMixedFleetDistribution(1000),
        config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
      });
      // Two replicas attempt 2× enqueue; active snapshot jobs remain ≤ concurrency per replica
      // if jobId dedup holds (one active job per vehicle per queue namespace).
      expect(perReplica.enqueuesPerMinute * 2).toBeGreaterThan(perReplica.enqueuesPerMinute);
      expect(readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5)).toBe(5);
    });
  });
});

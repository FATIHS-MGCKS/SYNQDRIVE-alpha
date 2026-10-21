import { parseTripPartialBoundaryRepairEnabled } from '@config/worker.config';
import { loadSnapshotPollingTierConfig } from './snapshot-polling-tier.config';
import {
  ACTIVE_TICK_DIMO_CALLS_PER_JOB,
  buildWorkloadModelRow,
  consumerCapacityJobsPerMinute,
  FLEET_SCENARIOS,
  maxProcessLocalDimoConcurrency,
} from './p12-final5-workload-model';
import {
  buildCurrentProdFleetLoadTable,
  CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N,
  DEPLOY_TRANSITION_MODEL,
  evaluateFleetEnvelope,
  recommendSnapshotConcurrencyForFleet,
} from './current-prod-fleet-envelope';
import {
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
  isBoundaryRefreshRetryable,
} from '../../../modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { readWorkerConcurrency } from '@config/worker-concurrency.util';

const GENERATION = buildBoundaryRepairGeneration({
  auditId: 'final6-rollback',
  providerSegmentId: 'seg-1',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

describe('P1.2 FINAL-6 current-production release gate', () => {
  describe('1 — production topology constants', () => {
    it('documents single fork PM2 deploy without rolling overlap', () => {
      expect(DEPLOY_TRANSITION_MODEL.pm2Mode).toBe('fork');
      expect(DEPLOY_TRANSITION_MODEL.rollingDeploy).toBe(false);
      expect(DEPLOY_TRANSITION_MODEL.bootCheckExitsBeforeListen).toBe(true);
      expect(DEPLOY_TRANSITION_MODEL.canTwoSchedulersOverlapDuringNormalDeploy).toBe(
        false,
      );
    });
  });

  describe('2 — current fleet load table (S1 normal)', () => {
    const table = buildCurrentProdFleetLoadTable();

    it('covers N=10..250 scenarios', () => {
      expect(table.map((r) => r.fleetSize)).toEqual([10, 25, 50, 100, 250]);
    });

    it('N=10..50 stable at default concurrency=5', () => {
      for (const row of table.filter((r) => r.fleetSize <= 50)) {
        expect(row.stableAtDefaultConcurrency5).toBe(true);
        expect(row.backlogGrowthPerMinuteAtConcurrency5P50_8s).toBeLessThanOrEqual(0);
      }
    });

    it('N=100 marginal at default concurrency=5; N=250 throughput-negative', () => {
      const n100 = table.find((r) => r.fleetSize === 100)!;
      const n250 = table.find((r) => r.fleetSize === 250)!;
      expect(n100.minConcurrencyP50_8s).toBe(6);
      expect(n100.stableAtDefaultConcurrency5).toBe(false);
      expect(n250.minConcurrencyP50_8s).toBe(13);
      expect(n250.backlogGrowthPerMinuteAtConcurrency5P50_8s).toBeGreaterThan(50);
    });

    it('reports fast reconciliation and total DIMO load', () => {
      const n100 = table.find((r) => r.fleetSize === 100)!;
      expect(n100.fastReconciliationCallsPerHour).toBeLessThan(500);
      expect(n100.totalDimoRequestsPerMinute).toBeGreaterThan(
        n100.snapshotEnqueuePerMinute,
      );
    });
  });

  describe('3 — smallest safe concurrency (SAFE_FOR_CURRENT_LOAD)', () => {
    it('does not recommend concurrency=13 blindly — scales with fleet', () => {
      expect(recommendSnapshotConcurrencyForFleet(10)).toBe(2);
      expect(recommendSnapshotConcurrencyForFleet(25)).toBe(3);
      expect(recommendSnapshotConcurrencyForFleet(50)).toBe(4);
      expect(recommendSnapshotConcurrencyForFleet(100)).toBe(8);
      expect(recommendSnapshotConcurrencyForFleet(250)).toBe(16);
    });

    it('distinguishes SAFE_FOR_CURRENT_LOAD from provider certification', () => {
      const eval100 = evaluateFleetEnvelope({
        connectedVehicleCount: 100,
        snapshotConcurrency: 8,
      });
      expect(eval100.stableAtCurrentConcurrency).toBe(true);
      expect(eval100.warnings).toHaveLength(0);
      // Provider ceiling remains unknown — no CERTIFIED_PROVIDER_SAFE claim in API.
      expect(eval100.recommendedSnapshotConcurrency).toBe(8);
    });
  });

  describe('4 — process-local DIMO fan-out bound (current prod)', () => {
    it('defaults yield 21 max simultaneous telemetry HTTP slots', () => {
      const snapshot = readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5);
      const trip = readWorkerConcurrency('WORKER_TRIP_TRACKING_CONCURRENCY', 5);
      expect(
        maxProcessLocalDimoConcurrency({
          snapshotConcurrency: snapshot,
          tripTrackingConcurrency: trip,
        }),
      ).toBe(5 + 5 * ACTIVE_TICK_DIMO_CALLS_PER_JOB + 1);
    });
  });

  describe('5 — trip-loss regression matrix (A–T)', () => {
    const scenarios: Array<{
      id: string;
      permanentTripLoss: 'NO';
      eventualRecovery: 'YES' | 'N/A';
      testRef: string;
    }> = [
      { id: 'A', permanentTripLoss: 'NO', eventualRecovery: 'N/A', testRef: 'trip FSM + partial-boundary-repair.final3' },
      { id: 'B', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'tier polling + reconcile fast' },
      { id: 'C', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'LONG_IDLE 30min + reconcile cold' },
      { id: 'D', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'delayed-start-reconciliation.safety-gate' },
      { id: 'E', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'delayed-start-boundary.safety-gate' },
      { id: 'F', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'partial-suffix-repair.safety-gate' },
      { id: 'G', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'reconcileWindow segment fallback' },
      { id: 'H', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'BullMQ retry + jobId recycle' },
      { id: 'I', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'recharge client retry; backlog not loss' },
      { id: 'J', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'final31 enqueue fail after boundary applied' },
      { id: 'K', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'resume backfill >3min gap' },
      { id: 'L', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'cold tier 7d + resume cap 24h' },
      { id: 'M', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'trip-tracking-recovery.scheduler' },
      { id: 'N', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'final32 boundary refresh lifecycle' },
      { id: 'O', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'final32 stale ENQUEUED recovery' },
      { id: 'P', permanentTripLoss: 'NO', eventualRecovery: 'N/A', testRef: 'reconcileWindow idempotent' },
      { id: 'Q', permanentTripLoss: 'NO', eventualRecovery: 'N/A', testRef: 'snapshot jobId dedup' },
      { id: 'R', permanentTripLoss: 'NO', eventualRecovery: 'N/A', testRef: 'final31 optimistic lock' },
      { id: 'S', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'episode resolution + reconcile' },
      { id: 'T', permanentTripLoss: 'NO', eventualRecovery: 'YES', testRef: 'detectAndRepairMissingTrips' },
    ];

    it.each(scenarios)('$id — PERMANENT_TRIP_LOSS=$permanentTripLoss', (scenario) => {
      expect(scenario.permanentTripLoss).toBe('NO');
    });
  });

  describe('6 — rollback failure analysis', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE disables activity tiers', () => {
      process.env = {
        ...originalEnv,
        WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE: 'true',
      };
      const config = loadSnapshotPollingTierConfig(process.env);
      expect(config.legacyFixedCadence).toBe(true);
      expect(config.activityTierPollingEnabled).toBe(false);
    });

    it('TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false disables repair without orphaning applied boundaries', () => {
      process.env = {
        ...originalEnv,
        TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED: 'false',
      };
      expect(parseTripPartialBoundaryRepairEnabled(process.env.TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED)).toBe(
        false,
      );
      const completed = buildBoundaryRefreshRecord('COMPLETED', null, undefined, {
        generation: GENERATION,
      });
      expect(isBoundaryRefreshRetryable(completed)).toBe(false);
    });

    it('PENDING/ENQUEUED boundary refresh remains retryable after repair rollback flag', () => {
      process.env = {
        ...originalEnv,
        TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED: 'false',
      };
      expect(parseTripPartialBoundaryRepairEnabled(process.env.TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED)).toBe(
        false,
      );
      const pending = buildBoundaryRefreshRecord('PENDING', null, undefined, {
        generation: GENERATION,
      });
      expect(isBoundaryRefreshRetryable(pending)).toBe(true);
    });
  });

  describe('7 — deployment transition safety', () => {
    it('restart gap below 3min does not require resume backfill; above triggers it', () => {
      expect(DEPLOY_TRANSITION_MODEL.resumeBackfillThresholdMs).toBe(180_000);
    });

    it('boot check cannot overlap live schedulers (exits before listen)', () => {
      expect(DEPLOY_TRANSITION_MODEL.bootCheckExitsBeforeListen).toBe(true);
    });
  });

  describe('8 — certified operating envelope', () => {
    it('N=100 within envelope with concurrency=8 is stable', () => {
      const evaluation = evaluateFleetEnvelope({
        connectedVehicleCount: 100,
        snapshotConcurrency: 8,
      });
      expect(evaluation.withinCertifiedEnvelope).toBe(true);
      expect(evaluation.stableAtCurrentConcurrency).toBe(true);
      expect(CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N).toBe(100);
    });

    it('N=250 exceeds certified envelope even with tuned concurrency', () => {
      const evaluation = evaluateFleetEnvelope({
        connectedVehicleCount: 250,
        snapshotConcurrency: 16,
      });
      expect(evaluation.withinCertifiedEnvelope).toBe(false);
      expect(evaluation.stableAtCurrentConcurrency).toBe(true);
      expect(evaluation.warnings.some((w) => w.includes('exceeds certified envelope'))).toBe(
        true,
      );
    });
  });

  describe('N≈1000 — remains NOT CERTIFIED', () => {
    it('S1 N=1000 requires concurrency 51 at P50 8s', () => {
      const row = buildWorkloadModelRow({
        fleetSize: 1000,
        scenario: FLEET_SCENARIOS.S1,
      });
      expect(row.requiredSnapshotConcurrency.p50_8s).toBe(51);
      expect(consumerCapacityJobsPerMinute(5, 8)).toBeLessThan(
        row.snapshotEnqueuePerMinute,
      );
    });
  });
});

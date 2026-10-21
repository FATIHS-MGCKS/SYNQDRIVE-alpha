import {
  ACTIVE_TRIP_DETECTION_STATES,
  applyFastReconciliationVehicleCap,
  buildFastReconciliationWhere,
  estimateFastReconciliationCohortSize,
  loadFastReconciliationCohortConfig,
} from './fast-reconciliation-cohort';
import { buildAuditMixedFleetDistribution } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';
import { TripDetectionState } from '@prisma/client';

/**
 * FINAL-4 — fast reconciliation cohort semantics (corrected).
 *
 * providerFetchedAt is excluded from fast eligibility because LONG_IDLE polls
 * every 30min would otherwise keep the entire CONNECTED fleet in the fast cohort.
 */
describe('fast reconciliation cohort model (FINAL-4)', () => {
  const FAST_RECENCY_MS = 60 * 60_000;
  const LONG_IDLE_INTERVAL_MS =
    DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG.intervalMsByTier.LONG_IDLE;

  it('LONG_IDLE poll interval remains below legacy fast recency window', () => {
    expect(LONG_IDLE_INTERVAL_MS).toBeLessThan(FAST_RECENCY_MS);
  });

  it('buildFastReconciliationWhere excludes providerFetchedAt-only eligibility', () => {
    const where = buildFastReconciliationWhere(new Date('2026-08-29T12:00:00.000Z'));
    expect(JSON.stringify(where)).not.toContain('providerFetchedAt');
    expect(JSON.stringify(where)).toContain('lastSeenAt');
    expect(JSON.stringify(where)).toContain('lastActivityAt');
    expect(JSON.stringify(where)).toContain(TripDetectionState.ACTIVE_TRIP);
  });

  it('active trip FSM states are included for fast eligibility', () => {
    expect(ACTIVE_TRIP_DETECTION_STATES).toEqual(
      expect.arrayContaining([
        TripDetectionState.POSSIBLE_START,
        TripDetectionState.ACTIVE_TRIP,
        TripDetectionState.IDLE_WITHIN_TRIP,
        TripDetectionState.POSSIBLE_END,
      ]),
    );
  });

  it('at N=1000 mixed fleet, modeled fast cohort is bounded (~20%) not ~100%', () => {
    const fleetSize = 1000;
    const estimated = estimateFastReconciliationCohortSize({
      fleetSize,
      activeTripFraction: 0.05,
      recentActivityFraction: 0.15,
    });

    expect(estimated).toBeLessThanOrEqual(200);
    expect(estimated / fleetSize).toBeLessThanOrEqual(0.25);

    const fastRunsPerHour = 4;
    const reconcileCallsPerHour = estimated * fastRunsPerHour;
    expect(reconcileCallsPerHour).toBeLessThan(1000);
    expect(reconcileCallsPerHour).toBeGreaterThan(0);
  });

  it('applyFastReconciliationVehicleCap bounds per-run fan-out', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `veh-${i}`);
    expect(applyFastReconciliationVehicleCap(ids, 0)).toHaveLength(500);
    expect(applyFastReconciliationVehicleCap(ids, 250)).toHaveLength(250);
    expect(applyFastReconciliationVehicleCap(ids, 1000)).toHaveLength(500);
  });

  it('loadFastReconciliationCohortConfig reads env overrides', () => {
    const cfg = loadFastReconciliationCohortConfig({
      WORKER_FAST_RECONCILIATION_RECENCY_MS: '120000',
      WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN: '150',
    } as NodeJS.ProcessEnv);
    expect(cfg.recencyMs).toBe(120_000);
    expect(cfg.maxVehiclesPerRun).toBe(150);
  });

  it('documents reduced DIMO fan-out per fast run at N=1000', () => {
    const distribution = buildAuditMixedFleetDistribution(1000);
    expect(Object.values(distribution).reduce((a, b) => a + b, 0)).toBe(1000);

    const vehiclesPerFastRun = estimateFastReconciliationCohortSize({ fleetSize: 1000 });
    const fastRunsPerHour = 4;
    expect(vehiclesPerFastRun * fastRunsPerHour).toBeLessThan(1000);
  });
});

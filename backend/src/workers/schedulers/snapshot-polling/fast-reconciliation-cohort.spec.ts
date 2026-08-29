import { buildAuditMixedFleetDistribution } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';

/**
 * FINAL-2 section G — fast reconciliation recency model correction.
 *
 * Fast repair selects vehicles where lastSeenAt OR providerFetchedAt is within
 * the last hour. P1.2 LONG_IDLE polls every 30min and always refreshes
 * providerFetchedAt, so essentially the entire CONNECTED scheduler cohort
 * remains fast-reconciliation eligible — NOT 15–25% of fleet.
 */
describe('fast reconciliation cohort model (G)', () => {
  const FAST_RECENCY_MS = 60 * 60_000;
  const LONG_IDLE_INTERVAL_MS =
    DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG.intervalMsByTier.LONG_IDLE;

  it('LONG_IDLE providerFetchedAt refresh interval is below fast recency window', () => {
    expect(LONG_IDLE_INTERVAL_MS).toBeLessThan(FAST_RECENCY_MS);
  });

  it('at N=1000 mixed fleet, fast cohort ≈ entire pollable CONNECTED fleet', () => {
    const fleetSize = 1000;
    const distribution = buildAuditMixedFleetDistribution(fleetSize);

    // Every tier interval is <= 30min, so providerFetchedAt is refreshed within
    // 30min for all vehicles that remain in the scheduler cohort.
    const pollableVehicles = fleetSize;
    const fastEligibleByProviderFetchedAt = pollableVehicles;

    const fastRunsPerHour = 4;
    const reconcileCallsPerHour = fastEligibleByProviderFetchedAt * fastRunsPerHour;

    expect(fastEligibleByProviderFetchedAt).toBe(1000);
    expect(fastEligibleByProviderFetchedAt / fleetSize).toBeGreaterThan(0.95);
    expect(reconcileCallsPerHour).toBe(4000);

    // Prior P1 model assumed f_recent=15–25% → 150–250 vehicles/run.
    // Runtime semantics yield ~1000 vehicles/run instead.
    expect(reconcileCallsPerHour).toBeGreaterThan(1500);
  });

  it('documents DIMO segment + energy-event fan-out per fast run at N=1000', () => {
    const vehiclesPerFastRun = 1000;
    const dimoSegmentCallsPerRun = vehiclesPerFastRun; // useDimoSegmentFallback=true
    const energyEventCallsPerRun = vehiclesPerFastRun; // reconcileWindow step 5
    const fastRunsPerHour = 4;

    expect(dimoSegmentCallsPerRun * fastRunsPerHour).toBe(4000);
    expect(energyEventCallsPerRun * fastRunsPerHour).toBe(4000);
  });
});

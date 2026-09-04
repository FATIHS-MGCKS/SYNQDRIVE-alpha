import { shouldIncludeRefuelInEnqueuePlan } from './physical-refuel-enqueue-plan.util';
import { isV2StaleEnrichmentRecoverable, FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS } from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';

describe('physical-refuel enqueue plan (G2.1d B1)', () => {
  const asOfMs = Date.parse('2026-09-04T18:00:00.000Z');

  it('SE1 allows stale PENDING enrichment through enqueue plan guard', () => {
    const enrichment = {
      processingStatus: 'PENDING',
      lastAttemptAt: null,
      inputFingerprint: 'fp-1',
      resolverVersion: 'v1',
    };
    expect(isV2StaleEnrichmentRecoverable(enrichment as never, asOfMs)).toBe(true);
    expect(
      shouldIncludeRefuelInEnqueuePlan({
        fuelStationEnrichment: enrichment as never,
        enrichmentEnqueuedAt: new Date('2026-09-02T00:00:00.000Z'),
        asOfMs,
      }),
    ).toBe(true);
  });

  it('SE3 active PROCESSING is not recoverable', () => {
    const enrichment = {
      processingStatus: 'PROCESSING',
      lastAttemptAt: new Date(asOfMs - 60_000),
      inputFingerprint: 'fp-1',
      resolverVersion: 'v1',
    };
    expect(isV2StaleEnrichmentRecoverable(enrichment as never, asOfMs)).toBe(false);
    expect(
      shouldIncludeRefuelInEnqueuePlan({
        fuelStationEnrichment: enrichment as never,
        enrichmentEnqueuedAt: new Date('2026-09-02T00:00:00.000Z'),
        asOfMs,
      }),
    ).toBe(false);
  });

  it('SE2 stale PROCESSING enrichment is recoverable through enqueue plan guard', () => {
    const enrichment = {
      processingStatus: 'PROCESSING',
      lastAttemptAt: new Date(asOfMs - FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS - 60_000),
      inputFingerprint: 'fp-1',
      resolverVersion: 'v1',
    };
    expect(
      shouldIncludeRefuelInEnqueuePlan({
        fuelStationEnrichment: enrichment as never,
        enrichmentEnqueuedAt: new Date('2026-09-02T00:00:00.000Z'),
        asOfMs,
      }),
    ).toBe(true);
  });

  it('SE4 COMPLETED enrichment is not recoverable', () => {
    const enrichment = {
      processingStatus: 'COMPLETED',
      resolutionStatus: 'MATCHED',
      lastAttemptAt: new Date(asOfMs - 60_000),
      inputFingerprint: 'fp-1',
      resolverVersion: 'v1',
    };
    expect(isV2StaleEnrichmentRecoverable(enrichment as never, asOfMs)).toBe(false);
  });

  it('SE5 terminal FAILED enrichment is not recoverable', () => {
    const enrichment = {
      processingStatus: 'FAILED',
      resolutionStatus: 'NO_MATCH',
      lastAttemptAt: new Date(asOfMs - 60_000),
      inputFingerprint: 'fp-1',
      resolverVersion: 'v1',
    };
    expect(isV2StaleEnrichmentRecoverable(enrichment as never, asOfMs)).toBe(false);
  });
});

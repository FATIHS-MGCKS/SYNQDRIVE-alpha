import {
  TireOdometerAnchorSource,
  TireOdometerAnchorStatus,
} from '@prisma/client';
import {
  assessOdometerPlausibility,
  buildMountPeriodCreateData,
  buildSetupOdometerAnchorFields,
  deriveOdometerAnchorStatus,
  isPredictionCapable,
  mapProviderToAnchorSource,
  resolveOdometerAnchor,
  applyAnchorToRemainingKmProjection,
  isRuntimeTelemetryAutoAnchorEligible,
} from './tire-odometer-anchor';

describe('tire-odometer-anchor', () => {
  const baseContext = {
    latestState: null,
    vehicleMileageKm: null,
    lastKnownOdometerKm: null,
  };

  it('uses DIMO provider odometer when available', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        ...baseContext,
        latestState: {
          odometerKm: 45230,
          providerSource: 'DIMO',
          providerFetchedAt: new Date('2026-07-16T10:00:00Z'),
          sourceTimestamp: new Date('2026-07-16T09:55:00Z'),
          lastSeenAt: new Date('2026-07-16T10:00:00Z'),
          source: 'dimo',
        },
      },
    });

    expect(anchor.odometerKm).toBe(45230);
    expect(anchor.source).toBe(TireOdometerAnchorSource.PROVIDER_DIMO);
    expect(anchor.status).toBe(TireOdometerAnchorStatus.ANCHORED);
    expect(anchor.confidence).toBeGreaterThanOrEqual(90);
  });

  it('uses HIGH_MOBILITY provider odometer when available', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        ...baseContext,
        latestState: {
          odometerKm: 12000,
          providerSource: 'HIGH_MOBILITY',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'high_mobility',
        },
      },
    });

    expect(anchor.source).toBe(TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY);
    expect(anchor.status).toBe(TireOdometerAnchorStatus.ANCHORED);
  });

  it('accepts manual confirmed client odometer over telemetry', () => {
    const anchor = resolveOdometerAnchor({
      clientOdometerKm: 50000,
      manualConfirmed: true,
      context: {
        ...baseContext,
        latestState: {
          odometerKm: 45230,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
      },
    });

    expect(anchor.odometerKm).toBe(50000);
    expect(anchor.source).toBe(TireOdometerAnchorSource.MANUAL_CONFIRMED);
    expect(anchor.status).toBe(TireOdometerAnchorStatus.ANCHORED);
  });

  it('returns ANCHOR_REQUIRED when no odometer is available', () => {
    const anchor = resolveOdometerAnchor({ context: baseContext });

    expect(anchor.odometerKm).toBeNull();
    expect(anchor.source).toBe(TireOdometerAnchorSource.UNKNOWN);
    expect(anchor.status).toBe(TireOdometerAnchorStatus.ANCHOR_REQUIRED);
    expect(isPredictionCapable(anchor.status)).toBe(false);
  });

  it('flags odometer rollback as MEASUREMENT_REQUIRED', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        latestState: {
          odometerKm: 40000,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
        vehicleMileageKm: null,
        lastKnownOdometerKm: 50000,
      },
    });

    expect(anchor.plausibilityIssue).toBe('ROLLBACK');
    expect(anchor.status).toBe(TireOdometerAnchorStatus.MEASUREMENT_REQUIRED);
    expect(anchor.confidence).toBeLessThanOrEqual(30);
  });

  it('flags unrealistic jump as MEASUREMENT_REQUIRED', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        latestState: {
          odometerKm: 70000,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
        vehicleMileageKm: null,
        lastKnownOdometerKm: 50000,
      },
    });

    expect(anchor.plausibilityIssue).toBe('UNREALISTIC_JUMP');
    expect(anchor.status).toBe(TireOdometerAnchorStatus.MEASUREMENT_REQUIRED);
  });

  it('ignores client odometer without explicit confirmation (API manipulation guard)', () => {
    const anchor = resolveOdometerAnchor({
      clientOdometerKm: 999999,
      manualConfirmed: false,
      context: {
        ...baseContext,
        latestState: {
          odometerKm: 45230,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
      },
    });

    expect(anchor.odometerKm).toBe(45230);
    expect(anchor.clientValueIgnored).toBe(true);
    expect(anchor.source).toBe(TireOdometerAnchorSource.PROVIDER_DIMO);
  });

  it('allows runtime telemetry auto-anchor only for provider or latest-state sources', () => {
    const providerAnchor = resolveOdometerAnchor({
      context: {
        ...baseContext,
        latestState: {
          odometerKm: 45230,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
      },
    });
    expect(isRuntimeTelemetryAutoAnchorEligible(providerAnchor)).toBe(true);

    const inferredAnchor = resolveOdometerAnchor({
      context: {
        latestState: null,
        vehicleMileageKm: 88000,
        lastKnownOdometerKm: null,
      },
    });
    expect(isRuntimeTelemetryAutoAnchorEligible(inferredAnchor)).toBe(false);
  });

  it('falls back to vehicle mileage as HISTORICAL_INFERRED when telemetry missing', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        latestState: null,
        vehicleMileageKm: 88000,
        lastKnownOdometerKm: null,
      },
    });

    expect(anchor.odometerKm).toBe(88000);
    expect(anchor.source).toBe(TireOdometerAnchorSource.HISTORICAL_INFERRED);
    expect(anchor.confidence).toBeLessThan(50);
  });

  it('maps provider source strings', () => {
    expect(mapProviderToAnchorSource('HIGH_MOBILITY')).toBe(
      TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY,
    );
    expect(mapProviderToAnchorSource('DIMO')).toBe(TireOdometerAnchorSource.PROVIDER_DIMO);
    expect(mapProviderToAnchorSource('other', 'dimo')).toBe(
      TireOdometerAnchorSource.PROVIDER_DIMO,
    );
  });

  it('assesses plausibility with rollback tolerance', () => {
    expect(assessOdometerPlausibility(49960, 50000).issue).toBeNull();
    expect(assessOdometerPlausibility(49900, 50000).issue).toBe('ROLLBACK');
  });

  it('builds setup anchor fields without inventing values', () => {
    const fields = buildSetupOdometerAnchorFields(
      resolveOdometerAnchor({ context: baseContext }),
    );
    expect(fields.installedOdometerKm).toBeNull();
    expect(fields.odometerAnchorStatus).toBe(TireOdometerAnchorStatus.ANCHOR_REQUIRED);
  });

  it('withholds precise remaining km when anchor is not prediction-capable', () => {
    const projection = applyAnchorToRemainingKmProjection({
      anchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED,
      adjustedRemainingKm: 12000,
      confidenceScore: 80,
    });
    expect(projection.predictionCapable).toBe(false);
    expect(projection.adjustedRemainingKm).toBeNull();
    expect(projection.confidenceScore).toBeLessThanOrEqual(45);
  });

  it('derives anchor status from plausibility', () => {
    expect(deriveOdometerAnchorStatus(1000, null)).toBe(
      TireOdometerAnchorStatus.ANCHORED,
    );
    expect(deriveOdometerAnchorStatus(null, null)).toBe(
      TireOdometerAnchorStatus.ANCHOR_REQUIRED,
    );
    expect(deriveOdometerAnchorStatus(1000, 'ROLLBACK')).toBe(
      TireOdometerAnchorStatus.MEASUREMENT_REQUIRED,
    );
  });
});

describe('tire odometer anchor — multi-tenant mount period isolation', () => {
  it('mount period create data carries organization scope', () => {
    const anchor = resolveOdometerAnchor({
      context: {
        latestState: {
          odometerKm: 1000,
          providerSource: 'DIMO',
          providerFetchedAt: new Date(),
          sourceTimestamp: new Date(),
          lastSeenAt: new Date(),
          source: 'dimo',
        },
        vehicleMileageKm: null,
        lastKnownOdometerKm: null,
      },
    });
    const row = buildMountPeriodCreateData({
      organizationId: 'org-a',
      tireSetupId: 'setup-a',
      installedAt: new Date('2026-07-16T12:00:00Z'),
      anchor,
    });
    expect(row.organizationId).toBe('org-a');
    expect(row.tireSetupId).toBe('setup-a');
    expect(row.installedOdometerKm).toBe(1000);
  });
});

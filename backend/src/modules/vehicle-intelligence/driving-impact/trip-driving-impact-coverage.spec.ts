import { TripDrivingImpactAnalysisStatus } from '@prisma/client';
import {
  assessSourceCompleteness,
  auditTripDrivingImpactCoverage,
  buildTripDrivingImpactSourceFingerprint,
  computeDistanceDiscrepancyKm,
  isAuthoritativeForBrakeWear,
  isDistanceOutlier,
  resolveAnalysisStatus,
  resolveCanonicalTripDistance,
  TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION,
} from './trip-driving-impact-coverage.domain';
import { TripDrivingImpactBackfillService } from './trip-driving-impact-backfill.service';

function auditInput(
  overrides: Partial<Parameters<typeof auditTripDrivingImpactCoverage>[0]> = {},
) {
  return {
    tripId: 'trip-1',
    vehicleId: 'vehicle-1',
    organizationId: 'org-1',
    tripStatus: 'COMPLETED',
    startTime: '2026-03-01T08:00:00.000Z',
    endTime: '2026-03-01T09:00:00.000Z',
    distanceKm: 42,
    behaviorEnrichmentStatus: 'COMPLETED',
    drivingImpactStatus: 'PENDING',
    drivingImpactComputedAt: null,
    tripAnalysisStatus: 'IN_PROGRESS',
    updatedAt: '2026-03-01T09:05:00.000Z',
    existingTdi: null,
    ...overrides,
  };
}

describe('trip-driving-impact-coverage domain', () => {
  it('resolves canonical distance from finalized trip.distanceKm', () => {
    const canonical = resolveCanonicalTripDistance({
      distanceKm: 42.456,
      tripStatus: 'COMPLETED',
      endTime: '2026-03-01T09:00:00.000Z',
    });
    expect(canonical?.authoritativeDistanceKm).toBe(42.456);
    expect(canonical?.source).toBe('vehicle_trip.distance_km');
  });

  it('rejects non-final trips for canonical distance', () => {
    expect(
      resolveCanonicalTripDistance({
        distanceKm: 42,
        tripStatus: 'ONGOING',
        endTime: null,
      }),
    ).toBeNull();
  });

  it('builds stable source fingerprint for idempotent recompute', () => {
    const fp1 = buildTripDrivingImpactSourceFingerprint({
      tripId: 't1',
      vehicleId: 'v1',
      authoritativeDistanceKm: 42,
      sourceVersion: 'v1.1.0:trip-distance-km-v1',
      hardAccelerationCount: 1,
      hardBrakingCount: 2,
      fullBrakingCount: 0,
      brakingEventCount: 3,
      citySharePct: 30,
      highwaySharePct: 50,
      countryRoadSharePct: 20,
      behaviorEnrichmentStatus: 'COMPLETED',
      telemetryInput: 'HF_DERIVED',
      tripUpdatedAt: '2026-03-01T09:00:00.000Z',
    });
    const fp2 = buildTripDrivingImpactSourceFingerprint({
      tripId: 't1',
      vehicleId: 'v1',
      authoritativeDistanceKm: 42,
      sourceVersion: 'v1.1.0:trip-distance-km-v1',
      hardAccelerationCount: 1,
      hardBrakingCount: 2,
      fullBrakingCount: 0,
      brakingEventCount: 3,
      citySharePct: 30,
      highwaySharePct: 50,
      countryRoadSharePct: 20,
      behaviorEnrichmentStatus: 'COMPLETED',
      telemetryInput: 'HF_DERIVED',
      tripUpdatedAt: '2026-03-01T09:00:00.000Z',
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(24);
  });

  it('changes fingerprint when authoritative distance changes', () => {
    const base = {
      tripId: 't1',
      vehicleId: 'v1',
      sourceVersion: 'v1.1.0:trip-distance-km-v1',
      hardAccelerationCount: 0,
      hardBrakingCount: 0,
      fullBrakingCount: 0,
      brakingEventCount: 0,
      citySharePct: null,
      highwaySharePct: null,
      countryRoadSharePct: null,
      behaviorEnrichmentStatus: 'COMPLETED',
      telemetryInput: 'HF_DERIVED',
      tripUpdatedAt: '2026-03-01T09:00:00.000Z',
    };
    const a = buildTripDrivingImpactSourceFingerprint({
      ...base,
      authoritativeDistanceKm: 40,
    });
    const b = buildTripDrivingImpactSourceFingerprint({
      ...base,
      authoritativeDistanceKm: 55,
    });
    expect(a).not.toBe(b);
  });

  it('flags distance outlier beyond tolerance', () => {
    expect(isDistanceOutlier(computeDistanceDiscrepancyKm(55, 42))).toBe(true);
    expect(isDistanceOutlier(computeDistanceDiscrepancyKm(42.2, 42))).toBe(false);
  });

  it('marks partial completeness below threshold', () => {
    const completeness = assessSourceCompleteness({
      useTelemetryDrivingEvents: false,
      brakingEventCount: 0,
      citySharePct: null,
      highwaySharePct: null,
      hasTripCounts: true,
    });
    const status = resolveAnalysisStatus({
      canonicalDistance: resolveCanonicalTripDistance({
        distanceKm: 42,
        tripStatus: 'COMPLETED',
        endTime: '2026-03-01T09:00:00.000Z',
      })!,
      sourceCompleteness: completeness,
    });
    expect(status).toBe(TripDrivingImpactAnalysisStatus.PARTIAL);
  });

  it('allows COMPLETE and PARTIAL for brake wear', () => {
    expect(isAuthoritativeForBrakeWear(TripDrivingImpactAnalysisStatus.COMPLETE)).toBe(true);
    expect(isAuthoritativeForBrakeWear(TripDrivingImpactAnalysisStatus.PARTIAL)).toBe(true);
    expect(isAuthoritativeForBrakeWear(TripDrivingImpactAnalysisStatus.UNSUPPORTED)).toBe(false);
  });
});

describe('trip-driving-impact coverage audit classification', () => {
  it('classifies normal completed trip missing TDI as eligible', () => {
    const result = auditTripDrivingImpactCoverage(auditInput());
    expect(result.coverageClass).toBe('JOB_MISSING');
    expect(result.autoBackfillEligible).toBe(true);
  });

  it('classifies missing TDI when behavior not complete', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({ behaviorEnrichmentStatus: 'PENDING' }),
    );
    expect(result.coverageClass).toBe('ELIGIBLE_MISSING_TDI');
    expect(result.autoBackfillEligible).toBe(false);
  });

  it('classifies retry exhausted transient failure', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({ behaviorEnrichmentStatus: 'FAILED_TRANSIENT' }),
    );
    expect(result.coverageClass).toBe('RETRY_EXHAUSTED');
    expect(result.autoBackfillEligible).toBe(true);
  });

  it('detects changed trip distance as stale TDI', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({
        tripId: 'trip-stale',
        distanceKm: 55,
        existingTdi: {
          tripId: 'trip-stale',
          authoritativeDistanceKm: 42,
          distanceKm: 42,
          sourceFingerprint: 'fp1',
          analysisStatus: 'COMPLETE',
          calculatedAt: '2026-03-01T09:10:00.000Z',
          tripDistanceKmAtSource: 42,
        },
      }),
    );
    expect(result.coverageClass).toBe('DISTANCE_STALE');
    expect(result.distanceOutlier).toBe(true);
    expect(result.autoBackfillEligible).toBe(true);
  });

  it('classifies segment partial data as PARTIAL existing row', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({
        existingTdi: {
          tripId: 'trip-1',
          authoritativeDistanceKm: 42,
          distanceKm: 42,
          sourceFingerprint: 'fp1',
          analysisStatus: 'PARTIAL',
          calculatedAt: '2026-03-01T09:10:00.000Z',
          tripDistanceKmAtSource: 42,
        },
      }),
    );
    expect(result.coverageClass).toBe('ALREADY_COMPLETE');
    expect(result.analysisStatus).toBe(TripDrivingImpactAnalysisStatus.PARTIAL);
  });

  it('rejects unsupported short trip distance', () => {
    const result = auditTripDrivingImpactCoverage(auditInput({ distanceKm: 1 }));
    expect(result.coverageClass).toBe('UNSUPPORTED_DATA');
    expect(result.analysisStatus).toBe(TripDrivingImpactAnalysisStatus.UNSUPPORTED);
  });

  it('rejects trip not final', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({ tripStatus: 'ONGOING', endTime: null }),
    );
    expect(result.coverageClass).toBe('TRIP_NOT_FINAL');
  });

  it('scopes backfill plan by organization (cross-tenant guard)', () => {
    const rows = [
      auditTripDrivingImpactCoverage(auditInput({ organizationId: 'org-1' })),
      auditTripDrivingImpactCoverage(auditInput({ tripId: 'trip-2', organizationId: 'org-2' })),
    ];
    const svc = new TripDrivingImpactBackfillService({} as any);
    const plan = svc.planBackfill(rows, {
      dryRun: true,
      organizationId: 'org-1',
      maxBatchSize: 25,
    });
    expect(plan.autoBackfill.every((r) => r.organizationId === 'org-1')).toBe(true);
    expect(plan.autoBackfill.some((r) => r.tripId === 'trip-2')).toBe(false);
  });

  it('defaults to dry run plan', () => {
    const svc = new TripDrivingImpactBackfillService({} as any);
    const plan = svc.planBackfill([auditTripDrivingImpactCoverage(auditInput())], {
      dryRun: true,
      organizationId: 'org-1',
      maxBatchSize: 10,
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.auditVersion).toBe(TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION);
  });
});

describe('parallel worker idempotency semantics', () => {
  it('same fingerprint implies no duplicate distance accounting', () => {
    const fp = buildTripDrivingImpactSourceFingerprint({
      tripId: 't1',
      vehicleId: 'v1',
      authoritativeDistanceKm: 42,
      sourceVersion: 'v1.1.0:trip-distance-km-v1',
      hardAccelerationCount: 1,
      hardBrakingCount: 1,
      fullBrakingCount: 0,
      brakingEventCount: 2,
      citySharePct: 20,
      highwaySharePct: 60,
      countryRoadSharePct: 20,
      behaviorEnrichmentStatus: 'COMPLETED',
      telemetryInput: 'HF_DERIVED',
      tripUpdatedAt: '2026-03-01T09:00:00.000Z',
    });
    const existing = {
      tripId: 't1',
      authoritativeDistanceKm: 42,
      distanceKm: 42,
      sourceFingerprint: fp,
      analysisStatus: TripDrivingImpactAnalysisStatus.COMPLETE,
      calculatedAt: '2026-03-01T09:10:00.000Z',
      tripDistanceKmAtSource: 42,
    };
    const audit = auditTripDrivingImpactCoverage(auditInput({ tripId: 't1', existingTdi: existing }));
    expect(audit.coverageClass).toBe('ALREADY_COMPLETE');
    expect(audit.autoBackfillEligible).toBe(false);
  });
});

describe('invalidated or deleted trip handling', () => {
  it('treats cancelled trip without end as not final', () => {
    const result = auditTripDrivingImpactCoverage(
      auditInput({ tripStatus: 'CANCELLED', endTime: null }),
    );
    expect(result.coverageClass).toBe('TRIP_NOT_FINAL');
    expect(result.recommendedAction).toBe('wait_for_trip_finalization');
  });
});

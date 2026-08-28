import {
  allManualReviewsResolved,
  countUnresolvedManualReviews,
  deriveManualReviewDisposition,
  isManualReviewDispositionResolved,
} from './energy-events-recovery-manual-review';
import {
  buildSanitizedFullSummaryArtifact,
  fuelDeltaBucket,
  odometerDeltaBucket,
  sanitizeCandidateEvidence,
  vehicleAliasForToken,
} from './energy-events-recovery-artifact-sanitize';
import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  ManualReviewEntry,
} from './energy-events-recovery.types';

describe('energy-events-recovery-manual-review disposition', () => {
  it('treats EXCLUDE_FROM_BACKFILL as resolved', () => {
    expect(isManualReviewDispositionResolved('EXCLUDE_FROM_BACKFILL')).toBe(true);
    expect(isManualReviewDispositionResolved('APPROVE_FOR_BACKFILL')).toBe(true);
    expect(isManualReviewDispositionResolved('NEEDS_FURTHER_EVIDENCE')).toBe(false);
  });

  it('counts only NEEDS_FURTHER_EVIDENCE as unresolved', () => {
    const entries: ManualReviewEntry[] = [
      {
        vehicle: 'ICE_A',
        tokenId: 1,
        mechanism: 'refuel',
        startTime: '2026-07-18T08:20:45Z',
        endTime: '2026-07-18T13:00:21Z',
        durationSeconds: 100,
        fuelDeltaLiters: 36,
        fuelDeltaPercent: 50,
        socDeltaPercent: null,
        energyDeltaKwh: null,
        odometerDeltaKm: 150,
        confidence: 'HIGH',
        plausibilityReasons: ['refuel_high_odometer_movement'],
        telemetryEvidenceNotes: [],
        overlapRelation: null,
        existingDbRelation: null,
        existingRowId: null,
        dimoSegmentId: 'seg-1',
        recommendation: 'EXCLUDE_FROM_BACKFILL',
      },
      {
        vehicle: 'ICE_C',
        tokenId: 2,
        mechanism: 'refuel',
        startTime: '2026-07-19T03:58:38Z',
        endTime: '2026-07-19T04:05:08Z',
        durationSeconds: 390,
        fuelDeltaLiters: 3,
        fuelDeltaPercent: 50,
        socDeltaPercent: null,
        energyDeltaKwh: null,
        odometerDeltaKm: 18,
        confidence: 'MEDIUM',
        plausibilityReasons: ['fuel_signal_contradiction'],
        telemetryEvidenceNotes: [],
        overlapRelation: null,
        existingDbRelation: null,
        existingRowId: null,
        dimoSegmentId: 'seg-2',
        recommendation: 'NEEDS_FURTHER_EVIDENCE',
      },
    ];
    expect(countUnresolvedManualReviews(entries)).toBe(1);
    expect(allManualReviewsResolved(entries)).toBe(false);
  });

  it('derives EXCLUDE for high odometer movement refuels', () => {
    expect(
      deriveManualReviewDisposition(['refuel_high_odometer_movement']),
    ).toBe('EXCLUDE_FROM_BACKFILL');
  });
});

describe('energy-events-recovery-artifact-sanitize', () => {
  const candidate = {
    classification: 'WOULD_CREATE',
    mechanism: 'refuel',
    vehicleId: 'real-uuid',
    tokenId: 187336,
    label: 'KS MX 2024',
    dimoSegmentId: 'dimo-refuel-187336-1787501715000',
    coalescedFromSegmentIds: ['dimo-refuel-187336-1787501715000'],
    startTime: '2026-08-23T16:15:15Z',
    endTime: '2026-08-23T16:23:16Z',
    durationSeconds: 481,
    fuelDeltaLiters: 16,
    fuelDeltaPercent: 29,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 187423,
    odometerEndKm: 187429,
    confidence: 'HIGH',
    detectorConfigVersion: 'e2-2026-08',
    manualReviewReasons: [],
    existingRowId: null,
    windowFrom: '2026-08-23T00:00:00.000Z',
    windowTo: '2026-08-24T00:00:00.000Z',
  } as EnergyRecoveryCandidate;

  it('maps tokenIds to aliases and buckets coarse values', () => {
    expect(vehicleAliasForToken(187336)).toBe('CANONICAL_REFUEL_CASE');
    expect(odometerDeltaBucket(6)).toBe('0_to_10km');
    expect(fuelDeltaBucket(16)).toBe('10_to_30L');

    const sanitized = sanitizeCandidateEvidence(candidate);
    expect(sanitized).not.toHaveProperty('tokenId');
    expect(sanitized).not.toHaveProperty('vehicleId');
    expect(sanitized).not.toHaveProperty('dimoSegmentId');
    expect(sanitized.alias).toBe('CANONICAL_REFUEL_CASE');
    expect(sanitized.odometerDeltaBucket).toBe('0_to_10km');
  });

  it('builds sanitized full summary without operational identifiers', () => {
    const report = {
      generatedAt: '2026-08-28T10:39:13.301Z',
      codeShaUnderTest: 'abc',
      baseMainSha: 'def',
      detectorConfigVersion: 'e2-2026-08',
      refuelDetectorConfig: { minIncreasePercent: 5 },
      rechargeDetectorConfig: 'default',
      outageStart: '2026-07-16T00:00:00.000Z',
      recoveryCutoff: '2026-08-28T08:00:00.000Z',
      windowSizeHours: 24,
      windowSizesHours: [24],
      windowSemantics: 'test windows',
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      dbVehicleMappingFailures: 0,
      vehicles: [
        {
          vehicleId: 'uuid',
          label: 'KS MX 2024',
          tokenId: 187336,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          existingEventCountInWindow: 0,
          energyClass: 'REFUEL_CANDIDATE',
        },
      ],
      requestAccounting: {
        telemetryGraphqlRequests: 220,
        tokenExchangeRequests: 0,
        mechanismRequests: 220,
        retries: 0,
      },
      refuelDetections: 1,
      rechargeDetections: 0,
      deduplicatedCandidateCount: 1,
      summary: {
        WOULD_CREATE: 1,
        WOULD_UPDATE: 0,
        ALREADY_IDENTICAL: 0,
        WOULD_SKIP_NOT_PERSISTABLE: 0,
        WOULD_REPLACE_LEGACY_SUBSEGMENTS: 0,
        MANUAL_REVIEW_REQUIRED: 0,
        FETCH_FAILED: 0,
      },
      candidates: [candidate],
      manualReviewReport: [],
      legacySubsegmentsWouldReplace: [],
      fetchFailures: [],
      trafficBudget: {
        eligibleVehicles: 1,
        inaccessibleVehicles: 0,
        windowsPerVehicle: 1,
        mechanismsPerWindowAverage: 1,
        expectedTelemetryGraphqlRequests: 1,
        worstCaseWithRetries: 3,
        proposedConcurrency: 2,
        interRequestDelayMs: 500,
        estimatedRuntimeMinutes: 1,
      },
      acceptance: {
        ksMx2024: {
          found: true,
          classification: 'WOULD_CREATE',
          segmentStart: '2026-08-23T16:15:15Z',
        },
        teslaRecharge: {
          detectedSessions: 0,
          wouldCreate: 0,
          alreadyIdentical: 0,
          manualReview: 0,
        },
      },
      dbWritesPerformed: false,
      backfillGate: 'NOT READY',
      manualReviewCount: 0,
      gateBlockers: [],
    } as EnergyRecoveryDryRunReport;

    const json = JSON.stringify(buildSanitizedFullSummaryArtifact(report));
    expect(json).not.toContain('187336');
    expect(json).not.toContain('dimo-refuel');
    expect(json).not.toContain('187423');
    expect(json).toContain('CANONICAL_REFUEL_CASE');
  });
});

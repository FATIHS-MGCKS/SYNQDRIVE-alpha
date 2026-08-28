import {
  applyRecoveryPlanManualReview,
  parseEnergyEventsRecoveryPlan,
  summarizeRecoveryPlanMatchFailures,
} from './energy-events-recovery-plan';
import { SYNTHETIC_E3A_RECOVERY_PLAN } from './energy-events-recovery-plan.fixture';
import { buildManualReviewBucketFingerprint } from './energy-events-recovery-manual-review-reporting';
import {
  countUnresolvedManualReviews,
  deriveManualReviewDisposition,
} from './energy-events-recovery-manual-review';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import { createDimoRequestAccounting } from './energy-events-recovery-accounting';
import { buildSanitizedFullSummaryArtifact } from './energy-events-recovery-artifact-sanitize';
import type { ManualReviewEntry } from './energy-events-recovery.types';

function entry(
  overrides: Partial<ManualReviewEntry> & Pick<ManualReviewEntry, 'dimoSegmentId' | 'plausibilityReasons' | 'confidence'>,
): ManualReviewEntry {
  return {
    vehicle: 'alias-only',
    tokenId: 100001,
    mechanism: 'refuel',
    startTime: '2026-07-19T03:50:00.000Z',
    endTime: '2026-07-19T03:58:00.000Z',
    durationSeconds: 480,
    fuelDeltaLiters: 3,
    fuelDeltaPercent: 52,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerDeltaKm: 18,
    telemetryEvidenceNotes: [],
    overlapRelation: null,
    existingDbRelation: null,
    existingRowId: null,
    recommendation: 'NEEDS_FURTHER_EVIDENCE',
    ...overrides,
  };
}

function sharedBucketProfile(
  dimoSegmentId: string,
): ManualReviewEntry {
  return entry({
    dimoSegmentId,
    confidence: 'MEDIUM',
    plausibilityReasons: [
      'fuel_signal_contradiction',
      'refuel_odometer_movement_during_event',
    ],
  });
}

describe('energy-events recovery plan manual-review authority', () => {
  it('A) identical bucket fingerprints do not auto-share human dispositions', () => {
    const caseA = sharedBucketProfile('synthetic-refuel-case-a');
    const caseB = sharedBucketProfile('synthetic-refuel-other-segment');

    expect(buildManualReviewBucketFingerprint(caseA)).toBe(
      buildManualReviewBucketFingerprint(caseB),
    );

    const result = applyRecoveryPlanManualReview(
      [caseA, caseB],
      {
        planVersion: 'test',
        reviewProvenance: 'test',
        reviewedDispositions: [
          {
            dimoSegmentId: 'synthetic-refuel-case-a',
            mechanism: 'refuel',
            disposition: 'EXCLUDE_FROM_BACKFILL',
            evidenceCategory: 'test_exclude_only_one',
          },
        ],
      },
    );

    expect(result.entries[0].recommendation).toBe('EXCLUDE_FROM_BACKFILL');
    expect(result.entries[1].recommendation).toBe('NEEDS_FURTHER_EVIDENCE');
    expect(result.appliedCount).toBe(1);
  });

  it('B) event-specific reviewed decision matches exactly one candidate', () => {
    const target = entry({
      dimoSegmentId: 'synthetic-refuel-case-b',
      confidence: 'LOW',
      plausibilityReasons: ['refuel_odometer_movement_during_event'],
    });

    const result = applyRecoveryPlanManualReview(
      [target],
      SYNTHETIC_E3A_RECOVERY_PLAN,
    );

    expect(result.appliedCount).toBe(1);
    expect(result.matchFailures).toHaveLength(1);
    expect(result.entries[0].recommendation).toBe('EXCLUDE_FROM_BACKFILL');
    expect(result.matchFailures[0].kind).toBe('UNMATCHED_REVIEWED_DISPOSITION');
  });

  it('C) zero matches blocks readiness via runner gate', async () => {
    const report = await runEnergyEventsRecoveryDryRun(
      [
        {
          vehicleId: 'veh-1',
          label: 'TEST',
          tokenId: 100001,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          capabilityLookupStatus: 'ok',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          existingEvents: [],
        },
      ],
      {
        fetchSegments: async () => ({
          segments: [],
          outcomes: [],
          accounting: createDimoRequestAccounting(),
        }),
        interRequestDelayMs: 0,
        windowsOverride: [
          { from: new Date('2026-07-18T00:00:00.000Z'), to: new Date('2026-07-19T00:00:00.000Z') },
        ],
        mode: 'full',
        dbComparisonEnabled: true,
        dbComparisonStatus: 'ok',
        recoveryPlan: {
          planVersion: 'test',
          reviewProvenance: 'test',
          reviewedDispositions: [
            {
              dimoSegmentId: 'nonexistent-segment',
              mechanism: 'refuel',
              disposition: 'EXCLUDE_FROM_BACKFILL',
              evidenceCategory: 'test',
            },
          ],
        },
      },
    );

    expect(report.gateBlockers).toContain('UNMATCHED_REVIEWED_DISPOSITION:1');
    expect(report.backfillGate).toBe('NOT READY');
  });

  it('D) multiple matches block readiness', () => {
    const duplicateA = sharedBucketProfile('synthetic-ambiguous');
    const duplicateB = {
      ...sharedBucketProfile('synthetic-ambiguous'),
      startTime: '2026-07-20T01:00:00.000Z',
    };

    const result = applyRecoveryPlanManualReview(
      [duplicateA, duplicateB],
      {
        planVersion: 'test',
        reviewProvenance: 'test',
        reviewedDispositions: [
          {
            dimoSegmentId: 'synthetic-ambiguous',
            mechanism: 'refuel',
            disposition: 'EXCLUDE_FROM_BACKFILL',
            evidenceCategory: 'test',
          },
        ],
      },
    );

    const failures = summarizeRecoveryPlanMatchFailures(result.matchFailures);
    expect(failures.ambiguous).toBe(1);
    expect(result.appliedCount).toBe(0);
    expect(result.entries.every((row) => row.recommendation === 'NEEDS_FURTHER_EVIDENCE')).toBe(
      true,
    );
  });

  it('E) no reviewed-disposition input leaves NEEDS candidates unchanged', async () => {
    const needsRefuel = {
      segmentId: 'dimo-refuel-100001-1721234567000',
      mechanism: 'refuel' as const,
      startTime: '2026-07-19T03:50:00.000Z',
      endTime: '2026-07-19T03:58:00.000Z',
      isOngoing: false,
      startedBeforeRange: false,
      durationSeconds: 480,
      startLatitude: 51.31,
      startLongitude: 9.49,
      endLatitude: 51.31,
      endLongitude: 9.49,
      odometerStartKm: 10000,
      odometerEndKm: 10018,
      fuelStartLiters: 20,
      fuelEndLiters: 23,
      fuelDeltaLiters: 3,
      fuelStartPercent: 40,
      fuelEndPercent: 52,
      fuelDeltaPercent: 12,
      socStartPercent: null,
      socEndPercent: null,
      socDeltaPercent: null,
      energyStartKwh: null,
      energyEndKwh: null,
      energyDeltaKwh: null,
    };

    const report = await runEnergyEventsRecoveryDryRun(
      [
        {
          vehicleId: 'veh-1',
          label: 'TEST',
          tokenId: 100001,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          capabilityLookupStatus: 'ok',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          existingEvents: [],
        },
      ],
      {
        fetchSegments: async () => ({
          segments: [needsRefuel],
          outcomes: [
            {
              mechanism: 'refuel',
              status: 'SUCCESS_WITH_EVENTS',
              segments: [needsRefuel],
              windowFrom: '2026-07-19T00:00:00.000Z',
              windowTo: '2026-07-20T00:00:00.000Z',
              tokenId: 100001,
            },
          ],
          accounting: createDimoRequestAccounting(),
        }),
        interRequestDelayMs: 0,
        windowsOverride: [
          { from: new Date('2026-07-19T00:00:00.000Z'), to: new Date('2026-07-20T00:00:00.000Z') },
        ],
        mode: 'full',
        dbComparisonEnabled: true,
        dbComparisonStatus: 'ok',
      },
    );

    expect(report.recoveryPlan).toBeNull();
    expect(report.manualReviewReport.length).toBeGreaterThan(0);
    expect(
      report.manualReviewReport.some(
        (row) => row.recommendation === 'NEEDS_FURTHER_EVIDENCE',
      ),
    ).toBe(true);
    expect(
      report.manualReviewReport.every(
        (row) =>
          deriveManualReviewDisposition(row.plausibilityReasons) ===
          row.recommendation,
      ),
    ).toBe(true);
  });

  it('F) explicit empty reviewed-disposition input applies no overrides', () => {
    const unresolved = entry({
      dimoSegmentId: 'synthetic-refuel-case-a',
      confidence: 'MEDIUM',
      plausibilityReasons: [
        'fuel_signal_contradiction',
        'refuel_odometer_movement_during_event',
      ],
    });

    const result = applyRecoveryPlanManualReview([unresolved], {
      planVersion: 'empty-test',
      reviewProvenance: 'explicit-empty',
      reviewedDispositions: [],
    });

    expect(result.appliedCount).toBe(0);
    expect(result.entries[0].recommendation).toBe('NEEDS_FURTHER_EVIDENCE');
    expect(countUnresolvedManualReviews(result.entries)).toBe(1);
  });

  it('G) synthetic event-specific review input resolves intended candidate only', () => {
    const caseA = entry({
      dimoSegmentId: 'synthetic-refuel-case-a',
      confidence: 'MEDIUM',
      plausibilityReasons: [
        'fuel_signal_contradiction',
        'refuel_odometer_movement_during_event',
      ],
    });
    const caseB = entry({
      dimoSegmentId: 'synthetic-refuel-case-b',
      confidence: 'LOW',
      plausibilityReasons: ['refuel_odometer_movement_during_event'],
    });
    const unrelated = entry({
      dimoSegmentId: 'synthetic-unrelated',
      confidence: 'HIGH',
      durationSeconds: 3 * 60 * 60,
      fuelDeltaLiters: 20,
      plausibilityReasons: [
        'refuel_duration_very_long',
        'refuel_high_odometer_movement',
      ],
    });

    const result = applyRecoveryPlanManualReview(
      [caseA, caseB, unrelated],
      SYNTHETIC_E3A_RECOVERY_PLAN,
    );

    expect(result.appliedCount).toBe(2);
    expect(result.matchFailures).toHaveLength(0);
    expect(result.entries[0].recommendation).toBe('EXCLUDE_FROM_BACKFILL');
    expect(result.entries[1].recommendation).toBe('EXCLUDE_FROM_BACKFILL');
    expect(result.entries[2].recommendation).toBe('NEEDS_FURTHER_EVIDENCE');
    expect(countUnresolvedManualReviews(result.entries)).toBe(1);
  });

  it('H) sanitized artifact still contains no operational identifiers', () => {
    const sanitized = buildSanitizedFullSummaryArtifact({
      generatedAt: '2026-08-28T00:00:00.000Z',
      codeShaUnderTest: 'abc',
      baseMainSha: 'def',
      detectorConfigVersion: 'e2-2026-08',
      refuelDetectorConfig: { minIncreasePercent: 5 },
      rechargeDetectorConfig: 'default',
      outageStart: '2026-07-16T00:00:00.000Z',
      recoveryCutoff: '2026-08-28T08:00:00.000Z',
      windowSizeHours: 24,
      windowSizesHours: [24],
      windowSemantics: 'test',
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      dbVehicleMappingFailures: 0,
      vehicles: [],
      capabilityEvidenceAggregate: {
        vehiclesByPowertrain: { ICE: 1, EV: 0, PHEV: 0, UNKNOWN: 0 },
        confirmedFuelSourceCounts: {
          DIMO_AVAILABLE_SIGNALS: 0,
          VEHICLE_BATTERY_CAPABILITY: 0,
          SUPPLEMENTAL_WINDOW_EVENTS: 0,
        },
        confirmedRechargeSourceCounts: {
          DIMO_AVAILABLE_SIGNALS: 0,
          VEHICLE_BATTERY_CAPABILITY: 0,
          SUPPLEMENTAL_WINDOW_EVENTS: 0,
        },
        suppressedFuelSourceCounts: {
          DIMO_AVAILABLE_SIGNALS: 0,
          VEHICLE_BATTERY_CAPABILITY: 0,
          SUPPLEMENTAL_WINDOW_EVENTS: 0,
        },
        suppressedRechargeSourceCounts: {
          DIMO_AVAILABLE_SIGNALS: 0,
          VEHICLE_BATTERY_CAPABILITY: 0,
          SUPPLEMENTAL_WINDOW_EVENTS: 0,
        },
        vehiclesWithSuppressedRechargeEvidence: 0,
        vehiclesWithSuppressedFuelEvidence: 0,
        availableSignalsProbeOk: 1,
        availableSignalsProbeFailed: 0,
        availableSignalsProbeNotAttempted: 0,
      },
      requestAccounting: createDimoRequestAccounting(),
      refuelDetections: 0,
      rechargeDetections: 0,
      deduplicatedCandidateCount: 0,
      summary: {
        WOULD_CREATE: 0,
        WOULD_UPDATE: 0,
        ALREADY_IDENTICAL: 0,
        WOULD_SKIP_NOT_PERSISTABLE: 0,
        WOULD_REPLACE_LEGACY_SUBSEGMENTS: 0,
        MANUAL_REVIEW_REQUIRED: 1,
        FETCH_FAILED: 0,
      },
      candidates: [],
      manualReviewReport: [
        entry({
          dimoSegmentId: 'private-segment-id',
          vehicle: 'plate-secret',
          tokenId: 999999,
          confidence: 'MEDIUM',
          plausibilityReasons: ['refuel_odometer_movement_during_event'],
        }),
      ],
      legacySubsegmentsWouldReplace: [],
      fetchFailures: [],
      trafficBudget: {
        eligibleVehicles: 1,
        inaccessibleVehicles: 0,
        capabilityUnknownVehicles: 0,
        windowsPerVehicle: 1,
        mechanismsPerWindowAverage: 1,
        expectedMechanismRequests: 1,
        expectedCapabilityProbeRequests: 0,
        expectedTelemetryGraphqlRequests: 1,
        worstCaseWithRetries: 3,
        proposedConcurrency: 2,
        interRequestDelayMs: 500,
        estimatedRuntimeMinutes: 1,
      },
      acceptance: {
        canonicalRefuel: {
          found: false,
          classification: 'NOT_FOUND',
          segmentStart: null,
        },
        canonicalEvRecharge: {
          detectedSessions: 0,
          wouldCreate: 0,
          alreadyIdentical: 0,
          manualReview: 0,
        },
      },
      dbWritesPerformed: false,
      backfillGate: 'NOT READY',
      manualReviewCount: 1,
      gateBlockers: [],
      recoveryPlan: {
        supplied: true,
        planVersion: 'e3a-test',
        reviewProvenance: 'test',
        reviewedDispositionCount: 1,
        appliedCount: 1,
        unmatchedCount: 0,
        ambiguousCount: 0,
      },
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('private-segment-id');
    expect(serialized).not.toContain('plate-secret');
    expect(serialized).not.toContain('999999');
    expect(sanitized).toHaveProperty('recoveryPlan');
  });

  it('I) normal detector/recovery behavior is unchanged without a recovery plan', async () => {
    const refuel = {
      segmentId: 'dimo-refuel-100001-1724427315000',
      mechanism: 'refuel' as const,
      startTime: '2026-08-23T16:15:15.000Z',
      endTime: '2026-08-23T16:23:16.000Z',
      isOngoing: false,
      startedBeforeRange: false,
      durationSeconds: 481,
      startLatitude: 51.31,
      startLongitude: 9.49,
      endLatitude: 51.31,
      endLongitude: 9.49,
      odometerStartKm: 12000,
      odometerEndKm: 12006,
      fuelStartLiters: 8,
      fuelEndLiters: 26,
      fuelDeltaLiters: 18,
      fuelStartPercent: 13,
      fuelEndPercent: 42,
      fuelDeltaPercent: 29,
      socStartPercent: null,
      socEndPercent: null,
      socDeltaPercent: null,
      energyStartKwh: null,
      energyEndKwh: null,
      energyDeltaKwh: null,
    };

    const report = await runEnergyEventsRecoveryDryRun(
      [
        {
          vehicleId: 'clveh1234567890123456789012',
          label: 'AUDIT_CANONICAL_REFUEL',
          tokenId: 100001,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          capabilityLookupStatus: 'ok',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          existingEvents: [],
        },
      ],
      {
        fetchSegments: async () => ({
          segments: [refuel],
          outcomes: [
            {
              mechanism: 'refuel',
              status: 'SUCCESS_WITH_EVENTS',
              segments: [refuel],
              windowFrom: '2026-08-22T00:00:00.000Z',
              windowTo: '2026-08-24T00:00:00.000Z',
              tokenId: 100001,
            },
          ],
          accounting: createDimoRequestAccounting(),
        }),
        interRequestDelayMs: 0,
        windowsOverride: [
          { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
        ],
        mode: 'full',
        dbComparisonEnabled: true,
        dbComparisonStatus: 'ok',
      },
    );

    expect(report.recoveryPlan).toBeNull();
    expect(report.summary.WOULD_CREATE).toBe(1);
    expect(report.manualReviewReport).toHaveLength(0);
  });
});

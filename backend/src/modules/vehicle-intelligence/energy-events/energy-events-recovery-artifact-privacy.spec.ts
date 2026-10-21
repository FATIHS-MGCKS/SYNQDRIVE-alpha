import * as fs from 'fs';
import * as path from 'path';
import {
  allManualReviewsResolved,
  countUnresolvedManualReviews,
  deriveManualReviewDisposition,
  isManualReviewDispositionResolved,
} from './energy-events-recovery-manual-review';
import {
  buildSanitizedFullSummaryArtifact,
  buildSanitizationContext,
  sanitizeCandidateEvidence,
} from './energy-events-recovery-artifact-sanitize';
import { createDimoRequestAccounting } from './energy-events-recovery-accounting';
import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  ManualReviewEntry,
} from './energy-events-recovery.types';
import {
  SYNTHETIC_CANONICAL_REFUEL_DURATION_SECONDS,
  SYNTHETIC_CANONICAL_REFUEL_END,
  SYNTHETIC_CANONICAL_REFUEL_LITERS,
  SYNTHETIC_CANONICAL_REFUEL_ODOMETER_END_KM,
  SYNTHETIC_CANONICAL_REFUEL_ODOMETER_START_KM,
  SYNTHETIC_CANONICAL_REFUEL_SEGMENT_ID,
  SYNTHETIC_CANONICAL_REFUEL_START,
  SYNTHETIC_CANONICAL_REFUEL_TOKEN_ID,
  SYNTHETIC_VEHICLE_ID,
} from './energy-events-recovery.test-fixtures';

describe('energy-events-recovery-manual-review disposition', () => {
  it('treats EXCLUDE_FROM_BACKFILL as resolved', () => {
    expect(isManualReviewDispositionResolved('EXCLUDE_FROM_BACKFILL')).toBe(true);
    expect(isManualReviewDispositionResolved('APPROVE_FOR_BACKFILL')).toBe(true);
    expect(isManualReviewDispositionResolved('NEEDS_FURTHER_EVIDENCE')).toBe(false);
  });

  it('counts only NEEDS_FURTHER_EVIDENCE as unresolved', () => {
    const entries: ManualReviewEntry[] = [
      {
        vehicle: 'AUDIT_ICE_A',
        tokenId: 100002,
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
        vehicle: 'AUDIT_ICE_C',
        tokenId: 100004,
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
    vehicleId: SYNTHETIC_VEHICLE_ID,
    tokenId: SYNTHETIC_CANONICAL_REFUEL_TOKEN_ID,
    label: 'AUDIT_CANONICAL_REFUEL',
    dimoSegmentId: SYNTHETIC_CANONICAL_REFUEL_SEGMENT_ID,
    coalescedFromSegmentIds: [SYNTHETIC_CANONICAL_REFUEL_SEGMENT_ID],
    startTime: SYNTHETIC_CANONICAL_REFUEL_START,
    endTime: SYNTHETIC_CANONICAL_REFUEL_END,
    durationSeconds: SYNTHETIC_CANONICAL_REFUEL_DURATION_SECONDS,
    fuelDeltaLiters: SYNTHETIC_CANONICAL_REFUEL_LITERS,
    fuelDeltaPercent: 29,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: SYNTHETIC_CANONICAL_REFUEL_ODOMETER_START_KM,
    odometerEndKm: SYNTHETIC_CANONICAL_REFUEL_ODOMETER_END_KM,
    confidence: 'HIGH',
    detectorConfigVersion: 'e2-2026-08',
    manualReviewReasons: [],
    existingRowId: null,
    windowFrom: '2026-08-23T00:00:00.000Z',
    windowTo: '2026-08-24T00:00:00.000Z',
  } as EnergyRecoveryCandidate;

  it('assigns aliases from inventory order without committed reverse mapping', () => {
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
          vehicleId: SYNTHETIC_VEHICLE_ID,
          label: 'AUDIT_CANONICAL_REFUEL',
          tokenId: SYNTHETIC_CANONICAL_REFUEL_TOKEN_ID,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          capabilityLookupStatus: 'ok',
          refuelApplicability: 'APPLICABLE',
          rechargeApplicability: 'NOT_APPLICABLE',
          existingEventCountInWindow: 0,
          energyClass: 'REFUEL_CANDIDATE',
        },
      ],
      capabilityEvidenceAggregate: {
        vehiclesByPowertrain: { ICE: 1, EV: 0, PHEV: 0, UNKNOWN: 0 },
        confirmedFuelSourceCounts: {
          DIMO_AVAILABLE_SIGNALS: 1,
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
      requestAccounting: {
        ...createDimoRequestAccounting(),
        telemetryGraphqlRequests: 225,
        capabilityProbeRequests: 5,
        mechanismRequests: 220,
        refuelSegmentRequests: 200,
        rechargeSegmentRequests: 20,
        tokenExchangeRequests: 5,
        developerAuthRequests: 1,
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
        capabilityUnknownVehicles: 0,
        windowsPerVehicle: 1,
        mechanismsPerWindowAverage: 1,
        expectedMechanismRequests: 1,
        expectedCapabilityProbeRequests: 1,
        expectedTelemetryGraphqlRequests: 2,
        worstCaseWithRetries: 3,
        proposedConcurrency: 2,
        interRequestDelayMs: 500,
        estimatedRuntimeMinutes: 1,
      },
      acceptance: {
        canonicalRefuel: {
          found: true,
          classification: 'WOULD_CREATE',
          segmentStart: SYNTHETIC_CANONICAL_REFUEL_START,
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
      manualReviewCount: 0,
      gateBlockers: [],
      recoveryPlan: null,
    } as EnergyRecoveryDryRunReport;

    const ctx = buildSanitizationContext(report);
    const sanitized = sanitizeCandidateEvidence(candidate, report, ctx);
    expect(sanitized.alias).toBe('CANONICAL_REFUEL_CASE');
    expect(sanitized).not.toHaveProperty('tokenId');
    expect(sanitized).not.toHaveProperty('vehicleId');
    expect(sanitized).not.toHaveProperty('dimoSegmentId');

    const json = JSON.stringify(buildSanitizedFullSummaryArtifact(report));
    expect(json).not.toMatch(/"tokenId"/);
    expect(json).not.toMatch(/"vehicleId"/);
    expect(json).not.toMatch(/"dimoSegmentId"/);
    expect(json).not.toMatch(/"existingRowId"/);
  });
});

describe('energy-events E3A privacy regression', () => {
  const artifactDir = path.resolve(__dirname, '../../../../../artifacts');
  const architectureDoc = path.resolve(
    __dirname,
    '../../../../../docs/architecture/ENERGY_EVENTS_E3A_OBSERVABILITY_RECOVERY_DRY_RUN_2026-08.md',
  );

  const forbiddenArtifactKeys = new Set([
    'tokenId',
    'vehicleId',
    'existingRowId',
    'dimoSegmentId',
    'startLatitude',
    'startLongitude',
    'endLatitude',
    'endLongitude',
    'odometerStartKm',
    'odometerEndKm',
    'startTime',
    'endTime',
    'label',
    'licensePlate',
  ]);

  const forbiddenDocPatterns = [
    /\bsrv\d+\.hstgr\b/i,
    /\|\s*tokenId\s*\|/i,
    /\b18[0-9]{4}\b/,
    /\bHMÜ\b/i,
    /\bWOB\s+L\b/i,
  ];

  function walkForbiddenKeys(value: unknown, pathParts: string[] = []): string[] {
    const violations: string[] = [];
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        violations.push(...walkForbiddenKeys(entry, [...pathParts, String(index)]));
      });
      return violations;
    }
    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (forbiddenArtifactKeys.has(key)) {
          violations.push([...pathParts, key].join('.'));
        }
        violations.push(...walkForbiddenKeys(nested, [...pathParts, key]));
      }
    }
    return violations;
  }

  it('sanitized artifacts contain no forbidden identifier fields', () => {
    for (const filename of [
      'energy-events-recovery-full-sanitized-summary-2026-08.json',
      'energy-events-recovery-quick-evidence-2026-08.json',
    ]) {
      const payload = JSON.parse(
        fs.readFileSync(path.join(artifactDir, filename), 'utf8'),
      );
      expect(walkForbiddenKeys(payload)).toEqual([]);
    }
  });

  it('architecture doc avoids production fleet mappings and hostnames', () => {
    const doc = fs.readFileSync(architectureDoc, 'utf8');
    for (const pattern of forbiddenDocPatterns) {
      expect(doc).not.toMatch(pattern);
    }
  });
});

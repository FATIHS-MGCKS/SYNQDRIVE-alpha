import {
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { CHARGE_OPPORTUNITY_RAW_POLICY_VERSION } from './charge-opportunity.constants';
import type { ChargeOpportunityRawFeaturesV1 } from './charge-opportunity.types';
import { computeFeatureInputDigestFromSnapshot } from './feature-input-canonical.serializer';
import {
  buildRestSessionFeatureInputSessionV1,
  buildRestSessionFeatureInputSnapshotV1,
} from './rest-session-feature-input-snapshot.builder';
import { buildRestSessionFeatureInputAnchorResolutionV1 } from './rest-session-feature-input-snapshot.types';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import * as canonicalPolicy from './rest-session-feature-canonical-row.policy';
import { REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS } from './rest-session-feature.constants';
import { RestSessionFeatureShadowInspectionService } from './rest-session-feature-shadow-inspection.service';
import { RestSessionFeatureRepository } from './rest-session-feature.repository';
import type { RestSessionFeatureRevisionIntegrityAggregate } from './rest-session-feature-inspection.repository.types';

const orgId = '11111111-1111-1111-1111-111111111111';
const vehId = '22222222-2222-2222-2222-222222222222';
const sessId = '33333333-3333-3333-3333-333333333333';
const anchorAt = new Date('2026-09-22T10:00:00.000Z');

function minimalChargeRaw(): ChargeOpportunityRawFeaturesV1 {
  return {
    policyVersion: CHARGE_OPPORTUNITY_RAW_POLICY_VERSION,
    restSessionId: sessId,
    windowSource: 'NONE',
    precedingTripId: null,
    precedingTripStartAt: null,
    precedingTripEndAt: null,
    chargeContextStartAt: null,
    chargeContextEndAt: anchorAt.toISOString(),
    tripEndToAnchorDeltaMs: null,
    precedingTripDurationMs: null,
    precedingTripDistanceKm: null,
    generalizedEvidenceRowsConsidered: 0,
    qualifiedLvObservationCount: 0,
    alternatorBandLvSampleCount: 0,
    engineRunningTrueProviderSnapshotObservationCount: 0,
    runningAlternatorAlignedObservationCount: 0,
    runningAlternatorPartialObservationCount: 0,
    classifierDrivingChargingObservationCount: 0,
    foreignTripObservationCount: 0,
    stateFetchTimeOnlyObservationCount: 0,
    engineRunningObservedCoverageMs: null,
    lvVoltageTimeProxyVms: null,
    lvVoltageTimeProxyCoveredMs: null,
    priorSessionMedianRestVoltageMv: null,
    temperatureC: null,
    temperatureSource: 'UNKNOWN',
    temperatureObservedAt: null,
    temperatureAgeMs: null,
    temperatureUncertainty: null,
    contextCompleteness: ['NO_RELIABLE_PRECEDING_TRIP'],
    chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    chargeContextSourceObservationIds: [],
    chargeContextSourceMeasurementIds: [],
    qualifiedLvObservationIds: [],
    qualifiedLvSourceMeasurementIds: [],
    engineRunningProviderSnapshotObservationIds: [],
    engineRunningProviderSnapshotSourceMeasurementIds: [],
    runningAlternatorAlignedObservationIds: [],
    runningAlternatorAlignedSourceMeasurementIds: [],
    runningAlternatorPartialObservationIds: [],
    runningAlternatorPartialSourceMeasurementIds: [],
  };
}

function minimalSnapshot(
  overrides: Partial<{ computationPhase: 'INCREMENTAL' | 'FINAL'; sessionTrust: 'VALID' | 'INVALIDATED' }> = {},
): RestSessionFeatureInputSnapshotV1 {
  return buildRestSessionFeatureInputSnapshotV1({
    organizationId: orgId,
    vehicleId: vehId,
    restSessionId: sessId,
    session: buildRestSessionFeatureInputSessionV1({
      anchorType: 'ENGINE_OFF',
      anchorAt,
      candidateTripId: null,
      confirmedTripId: null,
      sessionStatus: 'RESTING',
      computationPhase: overrides.computationPhase ?? 'INCREMENTAL',
      sessionTrust: overrides.sessionTrust ?? 'VALID',
      openedAt: anchorAt,
      confirmedAt: null,
      endedAt: null,
      endReason: null,
    }),
    anchorResolution: buildRestSessionFeatureInputAnchorResolutionV1({ status: 'UNAVAILABLE' }),
    anchor: null,
    eligibleRetentionPoints: [],
    retentionMetadataByObservationId: new Map(),
    chargeOpportunityRaw: minimalChargeRaw(),
  });
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sessId,
    organizationId: orgId,
    vehicleId: vehId,
    anchorType: 'ENGINE_OFF',
    anchorAt,
    sessionStatus: BatteryRestSessionStatus.RESTING,
    candidateTripId: null,
    confirmedTripId: null,
    openedAt: anchorAt,
    confirmedAt: null,
    endedAt: null,
    endReason: null,
    restObservationCount: 1,
    validRestObservationCount: 1,
    ...overrides,
  };
}

function featureRow(overrides: Record<string, unknown> = {}) {
  const inputSummary = minimalSnapshot();
  const inputDigest = computeFeatureInputDigestFromSnapshot(inputSummary);
  return {
    id: '44444444-4444-4444-4444-444444444444',
    organizationId: orgId,
    vehicleId: vehId,
    restSessionId: sessId,
    featureModelVersion: 'M3_3C_C3_V1',
    retentionPolicyVersion: 'M3_3C_C1_V1',
    chargeOpportunityPolicyVersion: 'M3_3C_C2_V1',
    semanticRevision: 1,
    inputDigest,
    inputSummary,
    computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
    sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
    chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    chargeOpportunityRaw: { policyVersion: 'M3_3C_C2_V1' },
    shutdownToFirstRestDeltaMv: null,
    robustRestSlopeMvPerHour: null,
    minimumRestVoltageMv: 12200,
    maximumRestVoltageMv: 12300,
    medianRestVoltageMv: 12250,
    restVoltageVarianceMv2: null,
    numberOfValidRestPoints: 1,
    maxActualRestAgeMs: 3600000,
    maxInterObservationGapMs: null,
    observationSpanMs: null,
    missingRungCount: null,
    pairwiseRestDeltas: null,
    computedAt: new Date('2026-09-22T11:00:00.000Z'),
    createdAt: new Date('2026-09-22T11:00:00.000Z'),
    ...overrides,
  };
}

function buildAggregateFromRows(
  rows: ReturnType<typeof featureRow>[],
): RestSessionFeatureRevisionIntegrityAggregate {
  const positive = rows.filter((r) => r.semanticRevision > 0);
  const distinctPositive = new Set(positive.map((r) => r.semanticRevision));
  return {
    totalRows: rows.length,
    incrementalRows: rows.filter(
      (r) =>
        (r.computationPhase as BatteryRestSessionFeatureComputationPhase) ===
        BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
    ).length,
    finalRows: rows.filter(
      (r) =>
        (r.computationPhase as BatteryRestSessionFeatureComputationPhase) ===
        BatteryRestSessionFeatureComputationPhase.FINAL,
    ).length,
    validRows: rows.filter(
      (r) =>
        (r.sessionTrust as BatteryRestSessionFeatureSessionTrust) ===
        BatteryRestSessionFeatureSessionTrust.VALID,
    ).length,
    invalidatedRows: rows.filter(
      (r) =>
        (r.sessionTrust as BatteryRestSessionFeatureSessionTrust) ===
        BatteryRestSessionFeatureSessionTrust.INVALIDATED,
    ).length,
    latestSemanticRevision: rows.length ? Math.max(...rows.map((r) => r.semanticRevision)) : null,
    positiveRevisionRowCount: positive.length,
    distinctPositiveRevisionCount: distinctPositive.size,
    minPositiveSemanticRevision: positive.length
      ? Math.min(...positive.map((r) => r.semanticRevision))
      : null,
    maxPositiveSemanticRevision: positive.length
      ? Math.max(...positive.map((r) => r.semanticRevision))
      : null,
    nonPositiveRevisionRowCount: rows.filter((r) => r.semanticRevision <= 0).length,
  };
}

function listCanonicalCandidatesFromRows(rows: ReturnType<typeof featureRow>[]) {
  const pairs = [
    {
      phase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
      trust: BatteryRestSessionFeatureSessionTrust.VALID,
    },
    {
      phase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
      trust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
    },
    {
      phase: BatteryRestSessionFeatureComputationPhase.FINAL,
      trust: BatteryRestSessionFeatureSessionTrust.VALID,
    },
    {
      phase: BatteryRestSessionFeatureComputationPhase.FINAL,
      trust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
    },
  ];
  return pairs
    .map(({ phase, trust }) =>
      [...rows]
        .filter(
          (r) =>
            (r.computationPhase as BatteryRestSessionFeatureComputationPhase) === phase &&
            (r.sessionTrust as BatteryRestSessionFeatureSessionTrust) === trust,
        )
        .sort((a, b) => b.semanticRevision - a.semanticRevision)[0],
    )
    .filter((row): row is ReturnType<typeof featureRow> => row != null);
}

function wireRepositoryMocks(allRows: ReturnType<typeof featureRow>[]) {
  const latest = [...allRows]
    .sort((a, b) => b.semanticRevision - a.semanticRevision)
    .slice(0, REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS)
    .reverse();

  jest
    .spyOn(RestSessionFeatureRepository.prototype, 'countFeatureRowsForSession')
    .mockResolvedValue(allRows.length);
  jest
    .spyOn(RestSessionFeatureRepository.prototype, 'readRevisionIntegrityAggregate')
    .mockResolvedValue(buildAggregateFromRows(allRows));
  jest
    .spyOn(RestSessionFeatureRepository.prototype, 'listLatestFeatureRowsForSession')
    .mockImplementation(async (input) => {
      expect(input.limit).toBe(REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS);
      return latest;
    });
  jest
    .spyOn(RestSessionFeatureRepository.prototype, 'listCanonicalCandidateRows')
    .mockResolvedValue(listCanonicalCandidatesFromRows(allRows));
}

function buildInspector(rows: ReturnType<typeof featureRow>[] = []) {
  wireRepositoryMocks(rows);
  const prisma = {
    batteryRestSession: {
      findFirst: jest.fn().mockResolvedValue(sessionRow()),
    },
  } as unknown as PrismaService;
  const inspector = new RestSessionFeatureShadowInspectionService(prisma);
  return { inspector, prisma };
}

function featureRowWithRevision(revision: number) {
  const openedAt = new Date(Date.parse('2026-09-22T10:00:00.000Z') + revision);
  const inputSummary = buildRestSessionFeatureInputSnapshotV1({
    organizationId: orgId,
    vehicleId: vehId,
    restSessionId: sessId,
    session: buildRestSessionFeatureInputSessionV1({
      anchorType: 'ENGINE_OFF',
      anchorAt,
      candidateTripId: null,
      confirmedTripId: null,
      sessionStatus: 'RESTING',
      computationPhase: 'INCREMENTAL',
      sessionTrust: 'VALID',
      openedAt,
      confirmedAt: null,
      endedAt: null,
      endReason: null,
    }),
    anchorResolution: buildRestSessionFeatureInputAnchorResolutionV1({ status: 'UNAVAILABLE' }),
    anchor: null,
    eligibleRetentionPoints: [],
    retentionMetadataByObservationId: new Map(),
    chargeOpportunityRaw: {
      ...minimalChargeRaw(),
      qualifiedLvObservationCount: revision,
    },
  });
  return featureRow({
    id: `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
    semanticRevision: revision,
    inputDigest: computeFeatureInputDigestFromSnapshot(inputSummary),
    inputSummary,
  });
}

describe('RestSessionFeatureShadowInspectionService (C5A unit)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TEST_I1: wrong org → SESSION_NOT_FOUND', async () => {
    const { inspector, prisma } = buildInspector();
    (prisma.batteryRestSession.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await inspector.inspectSession({
      organizationId: '00000000-0000-0000-0000-000000000000',
      vehicleId: vehId,
      restSessionId: sessId,
    });
    expect(result.status).toBe('SESSION_NOT_FOUND');
  });

  it('TEST_I2: wrong vehicle → SESSION_NOT_FOUND', async () => {
    const { inspector, prisma } = buildInspector();
    (prisma.batteryRestSession.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: '99999999-9999-9999-9999-999999999999',
      restSessionId: sessId,
    });
    expect(result.status).toBe('SESSION_NOT_FOUND');
  });

  it('TEST_I3: session with no rows → NO_FEATURE_ROWS', async () => {
    const { inspector } = buildInspector([]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.inspection.integrity.overallStatus).toBe('NO_FEATURE_ROWS');
      expect(result.inspection.canonicalFeature).toBeNull();
    }
  });

  it('TEST_I4: one valid incremental row → canonical selected', async () => {
    const { inspector } = buildInspector([featureRow()]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.inspection.featureSummary.canonicalFeatureRowId).toBeTruthy();
      expect(result.inspection.canonicalFeature?.computationPhase).toBe('INCREMENTAL');
      expect(result.inspection.integrity.overallStatus).toBe('OK');
    }
  });

  it('TEST_I5: ended session with FINAL VALID row → FINAL selected', async () => {
    const { inspector, prisma } = buildInspector([
      featureRow({ semanticRevision: 1 }),
      featureRow({
        id: '55555555-5555-5555-5555-555555555555',
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
      }),
    ]);
    (prisma.batteryRestSession.findFirst as jest.Mock).mockResolvedValue(
      sessionRow({
        sessionStatus: BatteryRestSessionStatus.ENDED,
        endedAt: new Date('2026-09-22T12:00:00.000Z'),
        endReason: 'VEHICLE_ACTIVITY',
      }),
    );
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.canonicalFeature?.computationPhase).toBe('FINAL');
    }
  });

  it('TEST_I6: invalidated session → FINAL INVALIDATED preferred', async () => {
    const { inspector, prisma } = buildInspector([
      featureRow({ semanticRevision: 1 }),
      featureRow({
        id: '66666666-6666-6666-6666-666666666666',
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
      }),
    ]);
    (prisma.batteryRestSession.findFirst as jest.Mock).mockResolvedValue(
      sessionRow({
        sessionStatus: BatteryRestSessionStatus.INVALIDATED,
        endReason: 'INVALIDATED',
        endedAt: new Date('2026-09-22T12:00:00.000Z'),
      }),
    );
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.canonicalFeature?.sessionTrust).toBe('INVALIDATED');
    }
  });

  it('TEST_I7: correct inputSummary → digestValid=true', async () => {
    const { inspector } = buildInspector([featureRow()]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.revisions[0].digestValid).toBe(true);
      expect(result.inspection.integrity.digestMismatchCount).toBe(0);
    }
  });

  it('TEST_I8: mismatched digest → digestValid=false + INTEGRITY_WARNING', async () => {
    const { inspector } = buildInspector([
      featureRow({ inputDigest: 'deadbeef'.repeat(8) }),
    ]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.revisions[0].digestValid).toBe(false);
      expect(result.inspection.integrity.overallStatus).toBe('INTEGRITY_WARNING');
    }
  });

  it('TEST_I11: raw default false → no raw JSON payload', async () => {
    const { inspector } = buildInspector([featureRow()]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.revisions[0].inputSummary).toBeUndefined();
      expect(result.inspection.revisions[0].chargeOpportunityRaw).toBeUndefined();
    }
  });

  it('TEST_I12: includeRaw=true → raw fields returned', async () => {
    const { inspector } = buildInspector([featureRow()]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
      includeRaw: true,
    });
    if (result.status === 'OK') {
      expect(result.inspection.revisions[0].inputSummary).toBeDefined();
      expect(result.inspection.revisions[0].chargeOpportunityRaw).toBeDefined();
    }
  });

  it('TEST_I13: canonical selection uses existing policy', async () => {
    const spy = jest.spyOn(canonicalPolicy, 'selectCanonicalRestSessionFeatureShadowRow');
    const row = featureRow();
    const { inspector } = buildInspector([row]);
    await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionStatus: BatteryRestSessionStatus.RESTING,
        rows: listCanonicalCandidatesFromRows([row]),
      }),
    );
  });

  it('TEST_I14: 125 revisions → latest-100 window + bounded DB read', async () => {
    const rows = Array.from({ length: 125 }, (_, i) => featureRowWithRevision(i + 1));
    const listLatestSpy = jest.spyOn(
      RestSessionFeatureRepository.prototype,
      'listLatestFeatureRowsForSession',
    );
    const { inspector } = buildInspector(rows);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    expect(listLatestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ limit: REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS }),
    );
    if (result.status === 'OK') {
      expect(result.inspection.featureSummary.totalRows).toBe(125);
      expect(result.inspection.revisions).toHaveLength(100);
      expect(result.inspection.featureSummary.revisionsTruncated).toBe(true);
      expect(result.inspection.revisions[0]?.semanticRevision).toBe(26);
      expect(result.inspection.revisions[99]?.semanticRevision).toBe(125);
      expect(result.inspection.integrity.digestRowsChecked).toBe(100);
      expect(result.inspection.integrity.digestRowsUnchecked).toBe(25);
      expect(result.inspection.integrity.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
      expect(result.inspection.integrity.overallStatus).toBe('INTEGRITY_PARTIAL');
    }
  });

  it('PARTIAL_COVERAGE_TEST: unchecked older rows → INTEGRITY_PARTIAL not OK', async () => {
    const rows = Array.from({ length: 125 }, (_, i) => featureRowWithRevision(i + 1));
    const { inspector } = buildInspector(rows);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.integrity.overallStatus).toBe('INTEGRITY_PARTIAL');
      expect(result.inspection.integrity.overallStatus).not.toBe('OK');
    }
  });

  it('CHECKED_DIGEST_MISMATCH_TEST: mismatch in latest window → INTEGRITY_WARNING', async () => {
    const bad = featureRow({ inputDigest: 'deadbeef'.repeat(8) });
    const { inspector } = buildInspector([bad]);
    const result = await inspector.inspectSession({
      organizationId: orgId,
      vehicleId: vehId,
      restSessionId: sessId,
    });
    if (result.status === 'OK') {
      expect(result.inspection.integrity.digestMismatchCount).toBe(1);
      expect(result.inspection.integrity.overallStatus).toBe('INTEGRITY_WARNING');
    }
  });
});

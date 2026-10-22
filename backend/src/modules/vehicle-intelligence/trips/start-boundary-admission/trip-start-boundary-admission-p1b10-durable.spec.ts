import {
  buildStartBoundaryAdmissionShadowDurableRecord,
  mergeMidGapSplitFollowOnShadowNotExecutedMeta,
  mergeStartBoundaryAdmissionShadowDurableIntoRawMeta,
  persistStartBoundaryAdmissionShadowDurable,
  readStartBoundaryAdmissionShadowDurable,
  readStartBoundaryAdmissionShadowDurableForOrgScopedTrip,
  START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY,
} from './trip-start-boundary-admission-durable.persistence';
import type { ShadowStartBoundaryAdmissionSummary } from './trip-start-boundary-admission-shadow.runtime';
import { boundaryResolution } from './trip-start-boundary-admission-p1b-orchestration.harness';
import { P1B_ORCH_CANDIDATE, P1B_ORCH_LEGACY_START, P1B_ORCH_NOW } from './trip-start-boundary-admission-p1b-orchestration.harness';

const TRIP_ID = 'trip-durable-1';
const VEHICLE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORG_A = 'org-a';
const ORG_B = 'org-b';

function sampleShadow(): ShadowStartBoundaryAdmissionSummary {
  return {
    vehicleId: VEHICLE_ID,
    dimoTokenId: 1,
    integrationModality: 'SOFTWARE_INTEGRATION',
    providerSegmentId: 'seg-1',
    providerSegmentDetectionMechanism: 'changePointDetection',
    candidateStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    legacyCanonicalStartAt: P1B_ORCH_LEGACY_START.toISOString(),
    proposedCanonicalStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    shadowProposedStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    shadowDeltaMs: 1000,
    shadowDecision: 'MOVEMENT_BOUNDARY_SELECTED',
    deltaMs: 1000,
    decision: 'MOVEMENT_BOUNDARY_SELECTED',
    movementEvidenceSources: ['CORE_SPEED'],
    movementEvidenceCoverage: 'TRUSTED_MOVEMENT_PRESENT',
    routeEvidenceAvailable: true,
    additionalShadowRouteFetchPerformed: false,
    legacyRouteFetchPerformed: false,
    uncorroboratedPrefixFromAt: null,
    uncorroboratedPrefixToAt: null,
    shadowExecutionFailure: null,
    observedAt: P1B_ORCH_NOW.toISOString(),
  };
}

describe('P1B.10 durable start shadow persistence', () => {
  const evidence = boundaryResolution().evidence;

  it('writes once on confirmed start with shadow executed', () => {
    const record = buildStartBoundaryAdmissionShadowDurableRecord({
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
      organizationId: ORG_A,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: sampleShadow(),
      shadowEnabled: true,
      evidence,
      corePointCount: 12,
      env: { SYNQDRIVE_DEPLOYED_GIT_SHA: 'abcd1234abcd1234abcd1234abcd1234abcd1234' },
    });

    expect(record.executionStatus).toBe('EXECUTED');
    expect(record.shadow?.decision).toBe('MOVEMENT_BOUNDARY_SELECTED');
    expect(record.dataSourcesAtDecision.corePointCount).toBe(12);
    expect(record.releaseSha).toBe('abcd1234abcd1234abcd1234abcd1234abcd1234');

    const merged = mergeStartBoundaryAdmissionShadowDurableIntoRawMeta(
      { lifecycleRecovery: { preserved: true } },
      record,
    );
    expect(merged.lifecycleRecovery).toEqual({ preserved: true });
    expect(readStartBoundaryAdmissionShadowDurable(merged)?.tripId).toBe(TRIP_ID);
  });

  it('idempotent merge and persist skip when durable key already present', async () => {
    const prior = mergeStartBoundaryAdmissionShadowDurableIntoRawMeta(
      {},
      buildStartBoundaryAdmissionShadowDurableRecord({
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
        organizationId: ORG_A,
        candidateStartAt: P1B_ORCH_CANDIDATE,
        confirmedAt: P1B_ORCH_NOW,
        shadowSummary: sampleShadow(),
        shadowEnabled: true,
        evidence,
        corePointCount: 3,
      }),
    );

    const update = jest.fn();
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRIP_ID,
          vehicleId: VEHICLE_ID,
          rawDetectionMeta: prior,
        }),
        update,
      },
    };

    const status = await persistStartBoundaryAdmissionShadowDurable({
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
      organizationId: ORG_A,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: sampleShadow(),
      shadowEnabled: true,
      evidence,
      corePointCount: 99,
      prisma: prisma as any,
    });

    expect(status).toBe('SKIPPED_ALREADY_PRESENT');
    expect(update).not.toHaveBeenCalled();
  });

  it('RESTING clears detection lastEvidenceSummary but trip raw meta remains', () => {
    const tripMeta = mergeStartBoundaryAdmissionShadowDurableIntoRawMeta(
      {},
      buildStartBoundaryAdmissionShadowDurableRecord({
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
        organizationId: ORG_A,
        candidateStartAt: P1B_ORCH_CANDIDATE,
        confirmedAt: P1B_ORCH_NOW,
        shadowSummary: sampleShadow(),
        shadowEnabled: true,
        evidence,
        corePointCount: 1,
      }),
    );

    const restingDetectionSummary = { lastRestingReason: 'CUSUM_END' };
    expect(restingDetectionSummary).not.toHaveProperty(
      START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY,
    );
    expect(readStartBoundaryAdmissionShadowDurable(tripMeta)?.executionStatus).toBe(
      'EXECUTED',
    );
  });

  it('records NOT_EXECUTED when shadow disabled (no invented decision)', () => {
    const record = buildStartBoundaryAdmissionShadowDurableRecord({
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
      organizationId: ORG_A,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: null,
      shadowEnabled: false,
      evidence,
      corePointCount: 5,
    });
    expect(record.executionStatus).toBe('NOT_EXECUTED');
    expect(record.notExecutedReason).toBe('SHADOW_DISABLED');
    expect(record.shadow).toBeNull();
  });

  it('split follow-on trip marked SHADOW_NOT_EXECUTED without decision fields', () => {
    const merged = mergeMidGapSplitFollowOnShadowNotExecutedMeta(
      { splitFrom: 'trip-parent' },
      {
        tripId: 'trip-child',
        vehicleId: VEHICLE_ID,
        organizationId: ORG_A,
        secondStartAt: P1B_ORCH_NOW,
        splitFromTripId: 'trip-parent',
      },
    );
    const durable = readStartBoundaryAdmissionShadowDurable(merged);
    expect(durable?.executionStatus).toBe('NOT_EXECUTED');
    expect(durable?.notExecutedReason).toBe('MID_TRIP_GAP_SPLIT_FOLLOW_ON');
    expect(durable?.shadow).toBeNull();
    expect(merged.splitFrom).toBe('trip-parent');
  });

  it('persist failure is non-blocking and returns FAILED', async () => {
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRIP_ID,
          vehicleId: VEHICLE_ID,
          rawDetectionMeta: {},
        }),
        update: jest.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const tripMetrics = {
      tripStartBoundaryAdmissionShadowErrors: { inc: jest.fn() },
    };

    const status = await persistStartBoundaryAdmissionShadowDurable({
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
      organizationId: ORG_A,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: sampleShadow(),
      shadowEnabled: true,
      evidence,
      corePointCount: 1,
      prisma: prisma as any,
      tripMetrics: tripMetrics as any,
      logger: { warn: jest.fn() } as any,
    });

    expect(status).toBe('FAILED');
    expect(tripMetrics.tripStartBoundaryAdmissionShadowErrors.inc).toHaveBeenCalledWith({
      phase: 'durable_persist',
    });
  });

  it('org-scoped read returns null for wrong organization', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const out = await readStartBoundaryAdmissionShadowDurableForOrgScopedTrip(
      prisma as any,
      { tripId: TRIP_ID, organizationId: ORG_B },
    );
    expect(out).toBeNull();
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: {
        id: TRIP_ID,
        vehicle: { organizationId: ORG_B },
      },
      select: { rawDetectionMeta: true },
    });
  });

  it('parallel persist attempts — second call skips after first write', async () => {
    let stored: Record<string, unknown> = {};
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: TRIP_ID,
          vehicleId: VEHICLE_ID,
          rawDetectionMeta: stored,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { rawDetectionMeta: Record<string, unknown> } }) => {
          stored = data.rawDetectionMeta;
        }),
      },
    };

    const baseParams = {
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
      organizationId: ORG_A,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: sampleShadow(),
      shadowEnabled: true,
      evidence,
      corePointCount: 2,
      prisma: prisma as any,
    };

    const first = await persistStartBoundaryAdmissionShadowDurable(baseParams);
    const second = await persistStartBoundaryAdmissionShadowDurable({
      ...baseParams,
      corePointCount: 50,
    });

    expect(first).toBe('WRITTEN');
    expect(second).toBe('SKIPPED_ALREADY_PRESENT');
    expect(
      readStartBoundaryAdmissionShadowDurable(stored)?.dataSourcesAtDecision
        .corePointCount,
    ).toBe(2);
  });
});

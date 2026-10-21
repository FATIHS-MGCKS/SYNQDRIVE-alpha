import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
} from '@prisma/client';
import { Exp021MaturationShadowStratumSemanticMismatchError } from './reference-capture-exp021-maturation-shadow.errors';
import * as executionSemanticsLib from './reference-capture-exp021-maturation-shadow-execution-semantics.lib';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';
import { resolveFrozenStratumSemantics } from './reference-capture-exp021-maturation-shadow-signal-lane.lib';

function buildSlotFixture(overrides: { attempts?: unknown[] } = {}) {
  const windowTo = new Date('2026-09-16T12:00:00.000Z');
  const windowFrom = new Date(windowTo.getTime() - 60_000);
  const semantics = resolveFrozenStratumSemantics({
    signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
    queryGeometryMs: 60_000,
    windowFrom,
    windowTo,
  });

  return {
    id: 'slot-1',
    plannedAgeMs: 45_000,
    bullJobId: 'job-1',
    attempts: overrides.attempts ?? [],
    stratum: {
      id: 'stratum-1',
      signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
      queryGeometryMs: 60_000,
      windowFrom,
      windowTo,
      ...semantics,
      runtimeBuildShaAtEnrollment: 'sha-enroll',
      activityClassificationJson: { class: 'UNKNOWN_ACTIVITY', geometryMs: 60_000 },
      family: {
        id: 'family-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 123,
        canonicalWindowTo: windowTo,
        plannedAgesMsExact: [45_000],
      },
    },
  };
}

describe('ReferenceCaptureExp021MaturationShadowWorkerService', () => {
  const originalSha = process.env.GITHUB_SHA;

  beforeAll(() => {
    process.env.GITHUB_SHA = 'worker-test-runtime-sha';
  });

  afterAll(() => {
    if (originalSha === undefined) {
      delete process.env.GITHUB_SHA;
    } else {
      process.env.GITHUB_SHA = originalSha;
    }
  });

  function buildService(overrides: {
    providerOutcome?: Exp021MaturationShadowProviderOutcomeClass;
    providerSucceeded?: boolean;
    slot?: ReturnType<typeof buildSlotFixture>;
  } = {}) {
    const slot = overrides.slot ?? buildSlotFixture();
    const insertObservationAttempt = jest.fn().mockResolvedValue({ id: 'attempt-1' });
    const isError =
      overrides.providerOutcome === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR ||
      overrides.providerSucceeded === false;
    const executeHistoricalQuery = jest.fn().mockResolvedValue({
      requestStartedAt: new Date('2026-09-16T12:00:51.000Z'),
      requestCompletedAt: new Date('2026-09-16T12:00:52.000Z'),
      providerRequestPhase: isError ? 'PROVIDER_HTTP' : 'PROVIDER_HTTP',
      providerRequestSucceeded: overrides.providerSucceeded ?? true,
      providerOutcomeClass:
        overrides.providerOutcome ?? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
      providerStatus: isError ? 'ERROR' : 'SUCCESS',
      providerErrorClass: isError ? 'TRANSPORT_ERROR' : null,
      uniqueBucketLocusCount: isError ? null : 2,
      uniqueTemporalBucketStartCount: 2,
      perFieldRowCountJson: { speed: 2 },
      perFieldBucketLocusCountJson: { speed: 2 },
      firstProviderTimestamp: new Date('2026-09-16T11:59:30.000Z'),
      lastProviderTimestamp: new Date('2026-09-16T11:59:45.000Z'),
      bucketLocusManifestJson: ['speed|2026-09-16T11:59:30.000Z'],
      bucketLocusIdentityVersion: 'FIELD_PIPE_CANONICAL_ISO_MS',
      duplicateCount: 0,
      payloadRevisionCount: 0,
      changedPayloadLocusCount: 0,
      queryProvenanceJson: {},
    });

    const findObservationSlotById = jest
      .fn()
      .mockResolvedValueOnce(slot)
      .mockResolvedValue({
        ...slot,
        attempts: [{ providerRequestSucceeded: true, providerOutcomeClass: 'PROVIDER_SUCCESS_NONZERO' }],
      });

    const service = new ReferenceCaptureExp021MaturationShadowWorkerService(
      {
        isExp021MaturationShadowEnabled: () => true,
        isExp021MaturationShadowHfLaneEnabled: () => true,
        isExp021MaturationShadowSettlementLaneEnabled: () => true,
      } as never,
      {
        findObservationSlotById,
        resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(123),
        insertObservationAttempt,
      } as never,
      { executeHistoricalQuery } as never,
      { enqueueObservationSlot: jest.fn() } as never,
    );

    return { service, insertObservationAttempt, executeHistoricalQuery, findObservationSlotById, slot };
  }

  it('persists provider success-nonzero without canonical writes', async () => {
    const { service, insertObservationAttempt } = buildService();
    await service.executeObservationJob({
      observationSlotId: 'slot-1',
      windowFamilyId: 'family-1',
      windowStratumId: 'stratum-1',
      plannedAgeMs: 45_000,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 123,
      transportRetryOrdinal: 0,
    });
    expect(insertObservationAttempt).toHaveBeenCalledTimes(1);
    expect(insertObservationAttempt.mock.calls[0][0].rawFacts.providerOutcomeClass).toBe(
      Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
    );
    expect(insertObservationAttempt.mock.calls[0][0].rawFacts.runtimeBuildSha).toBe(
      'worker-test-runtime-sha',
    );
  });

  it('treats provider error as distinct from zero', async () => {
    const { service, insertObservationAttempt } = buildService({
      providerOutcome: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
      providerSucceeded: false,
    });
    await service.executeObservationJob({
      observationSlotId: 'slot-1',
      windowFamilyId: 'family-1',
      windowStratumId: 'stratum-1',
      plannedAgeMs: 45_000,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 123,
      transportRetryOrdinal: 0,
    });
    expect(insertObservationAttempt.mock.calls[0][0].rawFacts.uniqueBucketLocusCount).toBeNull();
    expect(insertObservationAttempt.mock.calls[0][0].rawFacts.providerOutcomeClass).toBe(
      Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
    );
  });

  it('fails closed on semantic drift without calling provider or inserting attempts', async () => {
    const { service, executeHistoricalQuery, insertObservationAttempt } = buildService();
    jest.spyOn(executionSemanticsLib, 'assertExecutionSemanticsMatchStratum').mockImplementation(() => {
      throw new Exp021MaturationShadowStratumSemanticMismatchError('drift');
    });

    await expect(
      service.executeObservationJob({
        observationSlotId: 'slot-1',
        windowFamilyId: 'family-1',
        windowStratumId: 'stratum-1',
        plannedAgeMs: 45_000,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 123,
        transportRetryOrdinal: 0,
      }),
    ).rejects.toThrow(Exp021MaturationShadowStratumSemanticMismatchError);

    expect(executeHistoricalQuery).not.toHaveBeenCalled();
    expect(insertObservationAttempt).not.toHaveBeenCalled();
  });
});

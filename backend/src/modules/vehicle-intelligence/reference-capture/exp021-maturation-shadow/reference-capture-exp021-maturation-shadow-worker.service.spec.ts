import { Exp021MaturationShadowProviderOutcomeClass, Exp021MaturationShadowSignalLane } from '@prisma/client';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';

describe('ReferenceCaptureExp021MaturationShadowWorkerService', () => {
  const slot = {
    id: 'slot-1',
    plannedAgeMs: 45_000,
    bullJobId: 'job-1',
    stratum: {
      id: 'stratum-1',
      signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
      resolvedProviderFields: ['speed'],
      windowFrom: new Date('2026-09-16T11:59:00.000Z'),
      windowTo: new Date('2026-09-16T12:00:00.000Z'),
      interval: '1s',
      querySemanticsHash: 'sem-1',
      signalSetHash: 'sig-1',
      family: {
        id: 'family-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 123,
        canonicalWindowTo: new Date('2026-09-16T12:00:00.000Z'),
        plannedAgesMsExact: [45_000],
      },
    },
    attempts: [],
  };

  function buildService(overrides: {
    providerOutcome?: Exp021MaturationShadowProviderOutcomeClass;
    providerSucceeded?: boolean;
  } = {}) {
    const insertObservationAttempt = jest.fn().mockResolvedValue({ id: 'attempt-1' });
    const isError =
      overrides.providerOutcome === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR ||
      overrides.providerSucceeded === false;
    const executeHistoricalQuery = jest.fn().mockResolvedValue({
      requestStartedAt: new Date('2026-09-16T12:00:51.000Z'),
      requestCompletedAt: new Date('2026-09-16T12:00:52.000Z'),
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

    const service = new ReferenceCaptureExp021MaturationShadowWorkerService(
      {
        isExp021MaturationShadowEnabled: () => true,
        isExp021MaturationShadowHfLaneEnabled: () => true,
        isExp021MaturationShadowSettlementLaneEnabled: () => true,
      } as never,
      {
        findObservationSlotById: jest.fn().mockResolvedValue(slot),
        resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(123),
        insertObservationAttempt,
      } as never,
      { executeHistoricalQuery } as never,
      { enqueueObservationSlot: jest.fn() } as never,
    );

    return { service, insertObservationAttempt, executeHistoricalQuery };
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
});

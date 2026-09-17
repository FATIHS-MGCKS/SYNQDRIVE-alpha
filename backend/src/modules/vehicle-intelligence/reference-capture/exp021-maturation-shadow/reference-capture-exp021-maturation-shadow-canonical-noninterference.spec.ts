import { Exp021MaturationShadowProviderOutcomeClass, Exp021MaturationShadowSignalLane } from '@prisma/client';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';

describe('EXP-021 maturation shadow canonical non-interference', () => {
  it('does not invoke canonical reference-capture acquisition or observation writer', async () => {
    const acquisitionExecute = jest.fn();
    const observationWriterWrite = jest.fn();

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

    const worker = new ReferenceCaptureExp021MaturationShadowWorkerService(
      {
        isExp021MaturationShadowEnabled: () => true,
        isExp021MaturationShadowHfLaneEnabled: () => true,
        isExp021MaturationShadowSettlementLaneEnabled: () => true,
      } as never,
      {
        findObservationSlotById: jest.fn().mockResolvedValue(slot),
        resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(123),
        insertObservationAttempt: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      } as never,
      {
        executeHistoricalQuery: jest.fn().mockResolvedValue({
          requestStartedAt: new Date('2026-09-16T12:00:45.300Z'),
          requestCompletedAt: new Date('2026-09-16T12:00:46.000Z'),
          providerRequestSucceeded: true,
          providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
          providerStatus: 'SUCCESS',
          providerErrorClass: null,
          uniqueBucketLocusCount: 1,
          uniqueTemporalBucketStartCount: 1,
          perFieldRowCountJson: { speed: 1 },
          perFieldBucketLocusCountJson: { speed: 1 },
          firstProviderTimestamp: new Date('2026-09-16T11:59:30.000Z'),
          lastProviderTimestamp: new Date('2026-09-16T11:59:30.000Z'),
          bucketLocusManifestJson: ['speed|2026-09-16T11:59:30.000Z'],
          bucketLocusIdentityVersion: 'FIELD_PIPE_CANONICAL_ISO_MS',
          duplicateCount: 0,
          payloadRevisionCount: 0,
          changedPayloadLocusCount: 0,
          queryProvenanceJson: { adapter: 'read_only' },
        }),
      } as never,
      { enqueueObservationSlot: jest.fn() } as never,
    );

    await worker.executeObservationJob({
      observationSlotId: 'slot-1',
      windowFamilyId: 'family-1',
      windowStratumId: 'stratum-1',
      plannedAgeMs: 45_000,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 123,
      transportRetryOrdinal: 0,
    });

    expect(acquisitionExecute).not.toHaveBeenCalled();
    expect(observationWriterWrite).not.toHaveBeenCalled();
  });
});

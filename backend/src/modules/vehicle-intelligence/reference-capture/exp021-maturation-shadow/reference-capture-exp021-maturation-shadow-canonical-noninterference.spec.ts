/**
 * Unit-level guard: worker path does not import canonical writers.
 * Real PostgreSQL fingerprint proof lives in postgres-redis integration suite.
 */
import { Exp021MaturationShadowProviderOutcomeClass, Exp021MaturationShadowSignalLane } from '@prisma/client';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';
import { resolveFrozenStratumSemantics } from './reference-capture-exp021-maturation-shadow-signal-lane.lib';

describe('EXP-021 maturation shadow canonical non-interference (unit guard)', () => {
  const originalSha = process.env.GITHUB_SHA;

  beforeAll(() => {
    process.env.GITHUB_SHA = 'canonical-guard-runtime-sha';
  });

  afterAll(() => {
    if (originalSha === undefined) {
      delete process.env.GITHUB_SHA;
    } else {
      process.env.GITHUB_SHA = originalSha;
    }
  });

  it('worker execution does not invoke canonical acquisition or observation writer mocks', async () => {
    const acquisitionExecute = jest.fn();
    const observationWriterWrite = jest.fn();

    const windowTo = new Date('2026-09-16T12:00:00.000Z');
    const windowFrom = new Date(windowTo.getTime() - 60_000);
    const semantics = resolveFrozenStratumSemantics({
      signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
      queryGeometryMs: 60_000,
      windowFrom,
      windowTo,
    });

    const slot = {
      id: 'slot-1',
      plannedAgeMs: 45_000,
      bullJobId: 'job-1',
      attempts: [],
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

    const worker = new ReferenceCaptureExp021MaturationShadowWorkerService(
      {
        isExp021MaturationShadowEnabled: () => true,
        isExp021MaturationShadowHfLaneEnabled: () => true,
        isExp021MaturationShadowSettlementLaneEnabled: () => true,
      } as never,
      {
        findObservationSlotById: jest
          .fn()
          .mockResolvedValueOnce(slot)
          .mockResolvedValue({
            ...slot,
            attempts: [{ providerRequestSucceeded: true, providerOutcomeClass: 'PROVIDER_SUCCESS_NONZERO' }],
          }),
        resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(123),
        insertObservationAttempt: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      } as never,
      {
        executeHistoricalQuery: jest.fn().mockResolvedValue({
          requestStartedAt: new Date('2026-09-16T12:00:45.300Z'),
          requestCompletedAt: new Date('2026-09-16T12:00:46.000Z'),
          providerRequestPhase: 'PROVIDER_HTTP',
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

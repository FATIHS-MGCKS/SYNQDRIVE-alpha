import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';

describe('ApdShadowBaselinePollEvidenceService idempotency', () => {
  const metrics = {
    recordSkippedInformative: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deferred reconcile updates only when newLvSourceObserved was false', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findMany = jest.fn().mockResolvedValue([
      {
        opportunityId: 'opp',
        policyVersion: 'P25_APD_B2_V1',
        decision: 'WOULD_SKIP',
        newLvSourceObserved: false,
        newTopLevelSourceObserved: false,
        additionalDiscoveryDelayMs: null,
        simulatedNextPollAt: null,
        simulatedDiscoveryAt: null,
        activationEpochId: 'epoch',
      },
    ]);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'poll-1',
      startedAt: new Date('2026-10-25T10:29:02.655Z'),
      finishedAt: new Date('2026-10-25T10:29:05.000Z'),
    });
    const service = new ApdShadowBaselinePollEvidenceService(
      {
        dimoPollLog: { findFirst },
        apdShadowReconciliationDecision: { findMany, updateMany },
      } as never,
      metrics as never,
    );

    await service.reconcileDeferredLvAfterSnapshotPersistence({
      organizationId: 'org',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      providerTimestampMs: Date.parse('2026-10-25T10:28:56.000Z'),
      snapshotCorrelationId:
        'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
      previousLvProviderSourceMsBeforePersist: Date.parse('2026-10-25T10:28:51.000Z'),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ newLvSourceObserved: false }),
      }),
    );
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(1);

    await service.reconcileDeferredLvAfterSnapshotPersistence({
      organizationId: 'org',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      providerTimestampMs: Date.parse('2026-10-25T10:28:56.000Z'),
      snapshotCorrelationId:
        'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
      previousLvProviderSourceMsBeforePersist: Date.parse('2026-10-25T10:28:51.000Z'),
    });
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(1);
  });

  it('discovery delay reconcile is idempotent on additionalDiscoveryDelayMs null guard', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findMany = jest.fn().mockResolvedValue([
      {
        opportunityId: 'opp-prior',
        policyVersion: 'P25_APD_B2_V1',
        realPollCompletedAt: new Date('2026-10-25T10:29:05.000Z'),
      },
    ]);
    const service = new ApdShadowBaselinePollEvidenceService(
      {
        apdShadowReconciliationDecision: { findMany, updateMany },
      } as never,
    );

    const input = {
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollStartedAtMs: Date.parse('2026-10-25T10:30:02.808Z'),
      observingPollCompletedAtMs: Date.parse('2026-10-25T10:30:08.000Z'),
    };
    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll(input);
    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll(input);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1][0].where.additionalDiscoveryDelayMs).toBeNull();
  });

  it('recordSkippedInformativeIfNeeded does not double-count on existing durable LV', () => {
    const service = new ApdShadowBaselinePollEvidenceService({} as never, metrics as never);
    service.recordSkippedInformativeIfNeeded({
      policyVersion: 'P25_APD_B2_V1',
      prePollDecision: 'WOULD_SKIP',
      patch: {
        newLvSourceObserved: true,
        newLvSourceAt: new Date(),
        newTopLevelSourceObserved: false,
        simulatedNextPollAt: null,
        simulatedDiscoveryAt: null,
        additionalDiscoveryDelayMs: null,
      },
      existing: {
        newLvSourceObserved: true,
        newTopLevelSourceObserved: false,
        additionalDiscoveryDelayMs: null,
        simulatedNextPollAt: null,
        simulatedDiscoveryAt: null,
      },
    });
    expect(metrics.recordSkippedInformative).not.toHaveBeenCalled();
  });
});

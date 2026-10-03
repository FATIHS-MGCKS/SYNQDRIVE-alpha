import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { SnapshotPollingTier } from '../snapshot-polling-tier.types';
import { TripDetectionState } from '@prisma/client';

describe('AdaptivePollingShadowService', () => {
  const repository = {
    upsertPrePollDecision: jest.fn().mockResolvedValue(undefined),
    updateOutcome: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdaptivePollingShadowRepository;

  const metrics = {
    setEnabled: jest.fn(),
    recordDecision: jest.fn(),
    recordFailure: jest.fn(),
    recordInformativeRealPoll: jest.fn(),
    recordProfileInvalidated: jest.fn(),
    recordProfileRecovered: jest.fn(),
  } as unknown as AdaptivePollingShadowMetricsService;

  const prisma = {
    batteryMeasurement: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
  };

  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    decisionAtMs: 3_000_000_000,
    origin: 'SCHEDULED',
    reconciliation: true,
    effectiveTier: SnapshotPollingTier.RESTING_STANDBY,
    tripDetectionState: TripDetectionState.RESTING,
    lastProviderFetchedAtMs: 2_999_000_000,
    lastTrustworthyLvSourceMs: 2_990_000_000,
    lvProviderTimestampsMs: Array.from({ length: 8 }, (_, i) => 2_900_000_000 + i * 28_800_000),
    providerGapOpen: false,
    connectivityState: 'CONNECTED',
    r9WakeKnown: false,
    wakeCorrelationId: null,
    deviceReconnectRecent: false,
    providerReconnectRecent: false,
  };

  afterEach(() => {
    jest.resetModules();
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    jest.clearAllMocks();
  });

  it('flag OFF → no evaluation/persistence', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'false';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const result = await service.observePrePoll(baseCtx);
    expect(result).toBeNull();
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
  });

  it('flag ON → persists B2 and B4 rows', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const result = await service.observePrePoll(baseCtx);
    expect(result?.opportunityId).toBeTruthy();
    expect(repository.upsertPrePollDecision).toHaveBeenCalledTimes(2);
  });

  it('evaluator exception path does not throw (fail-open)', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    (repository.upsertPrePollDecision as jest.Mock).mockRejectedValueOnce(
      new Error('db down'),
    );
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await expect(service.observePrePoll(baseCtx)).resolves.toBeNull();
    expect(metrics.recordFailure).toHaveBeenCalledWith('pre_poll');
  });

  it('active trip reconciliation uses forced trip safety in metrics', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePrePoll({
      ...baseCtx,
      reconciliation: false,
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
    });
    expect(repository.upsertPrePollDecision).toHaveBeenCalled();
  });
});

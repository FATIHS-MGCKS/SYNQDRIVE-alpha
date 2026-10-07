import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { SnapshotPollingTier } from '../snapshot-polling-tier.types';
import { TripDetectionState } from '@prisma/client';
import {
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
} from './adaptive-polling-shadow-cohort.config';

describe('AdaptivePollingShadowService', () => {
  const repository = {
    upsertPrePollDecision: jest.fn().mockResolvedValue(undefined),
    resolveLastAllowedReconciliationPollMs: jest.fn().mockResolvedValue(0),
    patchEnqueueOutcome: jest.fn().mockResolvedValue(undefined),
    updateSuccessfulPollOutcome: jest.fn().mockResolvedValue(undefined),
    updateFailedPollOutcome: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdaptivePollingShadowRepository;

  const metrics = {
    setEnabled: jest.fn(),
    setCohortMemberCount: jest.fn(),
    setCohortConfigFingerprint: jest.fn(),
    recordDecision: jest.fn(),
    recordFailure: jest.fn(),
    recordCohortExcluded: jest.fn(),
    recordInformativeRealPoll: jest.fn(),
    recordProfileInvalidated: jest.fn(),
    recordProfileRecovered: jest.fn(),
  } as unknown as AdaptivePollingShadowMetricsService;

  function enableShadowWithCohort() {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: 'org-1', vehicleId: 'veh-1' }],
    });
  }

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
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
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
    enableShadowWithCohort();
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
    enableShadowWithCohort();
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
    enableShadowWithCohort();
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

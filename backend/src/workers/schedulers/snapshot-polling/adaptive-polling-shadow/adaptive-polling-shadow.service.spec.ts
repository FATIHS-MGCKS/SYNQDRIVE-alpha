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
    resolveLastAllowedPollStartMs: jest.fn().mockResolvedValue(0),
    resolveSimulatedLastLvSourceMs: jest.fn().mockResolvedValue(null),
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
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ fuelType: 'ELECTRIC' }),
    },
    vehicleTrip: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    apdShadowReconciliationDecision: {
      findFirst: jest.fn().mockResolvedValue({ id: 'row' }),
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

  it('flag ON → actual poll start persists B2 and B4 rows', async () => {
    enableShadowWithCohort();
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const opportunityId = await service.observeActualBaselinePollStart({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      pollStartedAtMs: baseCtx.decisionAtMs,
      origin: baseCtx.origin,
      tripDetectionState: baseCtx.tripDetectionState,
      lastProviderFetchedAtMs: baseCtx.lastProviderFetchedAtMs,
      providerGapOpen: baseCtx.providerGapOpen,
      connectivityState: baseCtx.connectivityState,
      r9WakeKnown: baseCtx.r9WakeKnown,
      wakeCorrelationId: baseCtx.wakeCorrelationId,
      deviceReconnectRecent: baseCtx.deviceReconnectRecent,
      providerReconnectRecent: baseCtx.providerReconnectRecent,
    });
    expect(opportunityId).toBeTruthy();
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
    await expect(
      service.observeActualBaselinePollStart({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        pollStartedAtMs: baseCtx.decisionAtMs,
        origin: baseCtx.origin,
        tripDetectionState: baseCtx.tripDetectionState,
        lastProviderFetchedAtMs: null,
        providerGapOpen: false,
        connectivityState: null,
        r9WakeKnown: false,
        wakeCorrelationId: null,
        deviceReconnectRecent: false,
        providerReconnectRecent: false,
      }),
    ).resolves.toBeNull();
    expect(metrics.recordFailure).toHaveBeenCalledWith('pre_poll');
  });

  it('active trip uses vehicle_trips reconciliation classification', async () => {
    enableShadowWithCohort();
    (prisma.vehicleTrip.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'trip' });
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observeActualBaselinePollStart({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      pollStartedAtMs: baseCtx.decisionAtMs,
      origin: baseCtx.origin,
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
      lastProviderFetchedAtMs: null,
      providerGapOpen: false,
      connectivityState: null,
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    expect(repository.upsertPrePollDecision).toHaveBeenCalled();
    const row = (repository.upsertPrePollDecision as jest.Mock).mock.calls[0][0];
    expect(row.reconciliation).toBe(false);
  });
});

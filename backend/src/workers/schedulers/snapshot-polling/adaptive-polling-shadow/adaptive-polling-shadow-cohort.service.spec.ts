import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { SnapshotPollingTier } from '../snapshot-polling-tier.types';
import { TripDetectionState } from '@prisma/client';
import {
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
} from './adaptive-polling-shadow-cohort.config';

const ORG = 'org-1';
const VEH = 'veh-1';
const OTHER = 'veh-other';
const STALE = 'veh-stale';

function setValidCohort(members: { organizationId: string; vehicleId: string }[]) {
  process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify({
    version: P25_APD_LTE_R1_COHORT_V1,
    members,
  });
}

describe('AdaptivePollingShadowService cohort gating', () => {
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

  const prisma = {
    batteryMeasurement: {
      findMany: jest.fn().mockResolvedValue([]),
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
    organizationId: ORG,
    vehicleId: VEH,
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
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
    jest.clearAllMocks();
  });

  it('14 allowed member → B2+B4 decision rows', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    setValidCohort([{ organizationId: ORG, vehicleId: VEH }]);
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observeActualBaselinePollStart({
      organizationId: baseCtx.organizationId,
      vehicleId: baseCtx.vehicleId,
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
    expect(repository.upsertPrePollDecision).toHaveBeenCalledTimes(2);
  });

  it('15 excluded member → zero policy evaluation', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    setValidCohort([{ organizationId: ORG, vehicleId: VEH }]);
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observeActualBaselinePollStart({
      organizationId: baseCtx.organizationId,
      vehicleId: OTHER,
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
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
    expect(metrics.recordCohortExcluded).toHaveBeenCalledWith('NOT_ALLOWLISTED');
  });

  it('16 excluded → zero forensic writes (pre-poll)', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    setValidCohort([{ organizationId: ORG, vehicleId: VEH }]);
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePrePoll({ ...baseCtx, vehicleId: STALE });
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
  });

  it('17 excluded → zero outcome patch (post-poll)', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    setValidCohort([{ organizationId: ORG, vehicleId: VEH }]);
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePostPoll({
      organizationId: ORG,
      vehicleId: STALE,
      opportunityId: 'opp-1',
      realPollId: 'poll-1',
      pollStartedAtMs: 3_000_000_000,
      pollCompletedAtMs: 3_000_001_000,
      realPollVisibleLvSourceAtMs: null,
      previousLvSourceMs: null,
      newLvSourceMs: null,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });
    expect(repository.updateSuccessfulPollOutcome).not.toHaveBeenCalled();
  });

  it('18 pre-poll direct call cannot bypass selector (missing cohort)', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observeActualBaselinePollStart({
      organizationId: baseCtx.organizationId,
      vehicleId: baseCtx.vehicleId,
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
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
    expect(metrics.recordCohortExcluded).toHaveBeenCalledWith('CONFIG_MISSING');
  });

  it('19 post-poll direct call cannot bypass selector', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePostPoll({
      organizationId: ORG,
      vehicleId: VEH,
      opportunityId: 'opp-1',
      realPollId: 'poll-1',
      pollStartedAtMs: 3_000_000_000,
      pollCompletedAtMs: 3_000_001_000,
      realPollVisibleLvSourceAtMs: null,
      previousLvSourceMs: null,
      newLvSourceMs: 1,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });
    expect(repository.updateSuccessfulPollOutcome).not.toHaveBeenCalled();
  });

  it('20 two tenants with same vehicle id do not share lastAllowed state', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    setValidCohort([
      { organizationId: 'org-a', vehicleId: 'shared-veh' },
      { organizationId: 'org-b', vehicleId: 'shared-veh' },
    ]);
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const ctxA = { ...baseCtx, organizationId: 'org-a', vehicleId: 'shared-veh' };
    const ctxB = { ...baseCtx, organizationId: 'org-b', vehicleId: 'shared-veh' };
    await service.observeActualBaselinePollStart({
      organizationId: ctxA.organizationId,
      vehicleId: ctxA.vehicleId,
      pollStartedAtMs: ctxA.decisionAtMs,
      origin: ctxA.origin,
      tripDetectionState: ctxA.tripDetectionState,
      lastProviderFetchedAtMs: ctxA.lastProviderFetchedAtMs,
      providerGapOpen: ctxA.providerGapOpen,
      connectivityState: ctxA.connectivityState,
      r9WakeKnown: ctxA.r9WakeKnown,
      wakeCorrelationId: ctxA.wakeCorrelationId,
      deviceReconnectRecent: ctxA.deviceReconnectRecent,
      providerReconnectRecent: ctxA.providerReconnectRecent,
    });
    await service.observeActualBaselinePollStart({
      organizationId: ctxB.organizationId,
      vehicleId: ctxB.vehicleId,
      pollStartedAtMs: ctxB.decisionAtMs + 1,
      origin: ctxB.origin,
      tripDetectionState: ctxB.tripDetectionState,
      lastProviderFetchedAtMs: ctxB.lastProviderFetchedAtMs,
      providerGapOpen: ctxB.providerGapOpen,
      connectivityState: ctxB.connectivityState,
      r9WakeKnown: ctxB.r9WakeKnown,
      wakeCorrelationId: ctxB.wakeCorrelationId,
      deviceReconnectRecent: ctxB.deviceReconnectRecent,
      providerReconnectRecent: ctxB.providerReconnectRecent,
    });
    expect(repository.upsertPrePollDecision).toHaveBeenCalledTimes(4);
  });

  it('isEnabledForVehicle false when cohort missing while flag ON', () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    expect(service.isEnabledForVehicle(ORG, VEH)).toBe(false);
  });
});

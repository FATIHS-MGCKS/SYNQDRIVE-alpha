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
    updateOutcome: jest.fn().mockResolvedValue(undefined),
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
    await service.observePrePoll(baseCtx);
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
    await service.observePrePoll({ ...baseCtx, vehicleId: OTHER });
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
      pollCompletedAtMs: 3_000_001_000,
      previousLvSourceMs: null,
      newLvSourceMs: null,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });
    expect(repository.updateOutcome).not.toHaveBeenCalled();
  });

  it('18 pre-poll direct call cannot bypass selector (missing cohort)', async () => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePrePoll(baseCtx);
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
      pollCompletedAtMs: 3_000_001_000,
      previousLvSourceMs: null,
      newLvSourceMs: 1,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });
    expect(repository.updateOutcome).not.toHaveBeenCalled();
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
    await service.observePrePoll(ctxA);
    await service.observePrePoll(ctxB);
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

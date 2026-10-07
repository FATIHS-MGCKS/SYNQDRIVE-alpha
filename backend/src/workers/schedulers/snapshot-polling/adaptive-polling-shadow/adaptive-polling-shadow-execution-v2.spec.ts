import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { TripDetectionState } from '@prisma/client';
import {
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
} from './adaptive-polling-shadow-cohort.config';
import { P25_APD_SHADOW_EXECUTION_V2 } from './p25-apd-shadow-execution-versions';
import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';

describe('APDS-9.2B execution contract V2 (poll-start authority)', () => {
  let lastAllowedB2 = 0;
  let lastAllowedB4 = 0;
  const upsertCalls: Array<{ decision: string; reconciliation: boolean }> = [];

  const repository = {
    resolveLastAllowedPollStartMs: jest.fn(async (input: { policyVersion: string }) => {
      if (input.policyVersion.includes('B2')) return lastAllowedB2;
      return lastAllowedB4;
    }),
    resolveSimulatedLastLvSourceMs: jest.fn().mockResolvedValue(null),
    upsertPrePollDecision: jest.fn(async (row) => {
      upsertCalls.push({
        decision: row.decision,
        reconciliation: row.reconciliation,
      });
      expect(row.shadowExecutionVersion).toBe(P25_APD_SHADOW_EXECUTION_V2);
    }),
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
    vehicleTrip: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    apdShadowReconciliationDecision: {
      findFirst: jest.fn().mockResolvedValue({ id: 'row-1' }),
    },
  };

  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    pollStartedAtMs: 3_000_000_000,
    origin: 'SCHEDULED',
    tripDetectionState: TripDetectionState.RESTING,
    lastProviderFetchedAtMs: 2_999_000_000,
    providerGapOpen: false,
    connectivityState: 'CONNECTED',
    r9WakeKnown: false,
    wakeCorrelationId: null,
    deviceReconnectRecent: false,
    providerReconnectRecent: false,
  };

  function enableCohort() {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: 'org-1', vehicleId: 'veh-1' }],
    });
  }

  beforeEach(() => {
    lastAllowedB2 = 0;
    lastAllowedB4 = 0;
    upsertCalls.length = 0;
    jest.clearAllMocks();
    enableCohort();
  });

  afterEach(() => {
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
  });

  it('scheduler observePrePoll is non-authoritative (no rows)', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const result = await service.observePrePoll({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      decisionAtMs: Date.now(),
      origin: 'SCHEDULED',
      reconciliation: true,
      effectiveTier: 'RESTING_STANDBY' as never,
      tripDetectionState: TripDetectionState.RESTING,
      lastProviderFetchedAtMs: null,
      lastTrustworthyLvSourceMs: null,
      lvProviderTimestampsMs: [],
      providerGapOpen: false,
      connectivityState: null,
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    expect(result).toBeNull();
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
  });

  it('actual poll start creates policy rows without mutating in-memory lastAllowed', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observeActualBaselinePollStart(baseCtx);
    expect(lastAllowedB2).toBe(0);
    expect(lastAllowedB4).toBe(0);
    expect(repository.resolveLastAllowedPollStartMs).toHaveBeenCalled();
    expect(upsertCalls.length).toBe(2);
  });

  it('SUCCESS post-poll persists startedAt and does not mutate repository mock counters', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const opportunityId = await service.observeActualBaselinePollStart(baseCtx);
    const completedAt = baseCtx.pollStartedAtMs + 60_000;
    await service.observePostPoll({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: opportunityId!,
      realPollId: 'poll-success-1',
      pollStartedAtMs: baseCtx.pollStartedAtMs,
      pollCompletedAtMs: completedAt,
      realPollVisibleLvSourceAtMs: baseCtx.pollStartedAtMs - 1000,
      previousLvSourceMs: null,
      newLvSourceMs: null,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: completedAt,
      providerFetchedAtMs: null,
    });
    expect(repository.updateSuccessfulPollOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        realPollStartedAt: new Date(baseCtx.pollStartedAtMs),
        realPollCompletedAt: new Date(completedAt),
      }),
    );
    expect(lastAllowedB2).toBe(0);
  });

  it('FAILURE correlation does not advance durable lastAllowed', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const opportunityId = await service.observeActualBaselinePollStart(baseCtx);
    await service.observePollFailure({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: opportunityId!,
      realPollId: 'poll-fail-1',
      realPollStartedAt: new Date(baseCtx.pollStartedAtMs),
    });
    expect(lastAllowedB2).toBe(0);
    expect(repository.updateFailedPollOutcome).toHaveBeenCalled();
  });

  it('offline replay equivalence: poll-start timeline beats scheduler tick', () => {
    const profile = 'STABLE_PERIODIC' as const;
    const med = 8 * 3600_000;
    const lv = 2_990_000_000;
    const baseInput = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      reconciliation: true,
      lastTrustworthyLvSourceMs: lv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: med,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: profile,
    };
    const allowB2 = (last: number, nowMs: number) =>
      evaluateP25ApdB2V1Core({
        ...baseInput,
        decisionAtMs: nowMs,
        lastAllowedReconciliationPollMs: last,
      }).decision !== 'WOULD_SKIP';

    const pollTimes = [3_000_060_000, 3_000_720_000];
    const schedulerTimes = [
      3_000_000_000,
      3_000_030_000,
      3_000_120_000,
      3_000_600_000,
      3_000_660_000,
    ];

    let offlineB2 = 0;
    let liveB2 = 0;
    let b2Div = 0;

    for (const t of schedulerTimes) {
      const offB2 = allowB2(offlineB2, t);
      const liveDecB2 = allowB2(liveB2, t);
      if (offB2 !== liveDecB2) b2Div++;

      const pollsBefore = pollTimes.filter((p) => p <= t && p > liveB2);
      if (pollsBefore.length) {
        const pt = Math.max(...pollsBefore);
        if (allowB2(liveB2, pt)) liveB2 = pt;
      }

      for (const p of pollTimes) {
        if (p <= t && p > offlineB2 && allowB2(offlineB2, p)) offlineB2 = p;
      }
    }

    expect(liveB2).toBe(offlineB2);
  });
});

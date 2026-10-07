import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { SnapshotPollingTier } from '../snapshot-polling-tier.types';
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

describe('APDS-9.2 execution contract V2', () => {
  let lastAllowedB2 = 0;
  let lastAllowedB4 = 0;
  const upsertCalls: Array<{ decision: string; reconciliation: boolean }> = [];

  const repository = {
    resolveLastAllowedReconciliationPollMs: jest.fn(
      async (input: { policyVersion: string }) => {
        if (input.policyVersion.includes('B2')) return lastAllowedB2;
        return lastAllowedB4;
      },
    ),
    upsertPrePollDecision: jest.fn(async (row) => {
      upsertCalls.push({
        decision: row.decision,
        reconciliation: row.reconciliation,
      });
      expect(row.shadowExecutionVersion).toBe(P25_APD_SHADOW_EXECUTION_V2);
    }),
    patchEnqueueOutcome: jest.fn().mockResolvedValue(undefined),
    updateSuccessfulPollOutcome: jest.fn(
      async (input: { policyVersion: string; realPollCompletedAt: Date }) => {
        const t = input.realPollCompletedAt.getTime();
        if (input.policyVersion.includes('B2')) lastAllowedB2 = t;
        else lastAllowedB4 = t;
      },
    ),
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

  it('1 pre-poll does not mutate durable lastAllowed (resolve only)', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    await service.observePrePoll(baseCtx);
    expect(lastAllowedB2).toBe(0);
    expect(lastAllowedB4).toBe(0);
    expect(repository.resolveLastAllowedReconciliationPollMs).toHaveBeenCalled();
  });

  it('2 COALESCED enqueue patch does not advance lastAllowed', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const pre = await service.observePrePoll(baseCtx);
    await service.observeEnqueueOutcome({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: pre!.opportunityId,
      wakeOutcome: 'COALESCED',
      observedAtMs: baseCtx.decisionAtMs,
    });
    expect(lastAllowedB2).toBe(0);
    expect(repository.patchEnqueueOutcome).toHaveBeenCalled();
  });

  it('3 SUCCESS post-poll advances durable lastAllowed via repository', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const pre = await service.observePrePoll(baseCtx);
    const completedAt = baseCtx.decisionAtMs + 60_000;
    await service.observePostPoll({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: pre!.opportunityId,
      realPollId: 'poll-success-1',
      pollCompletedAtMs: completedAt,
      previousLvSourceMs: null,
      newLvSourceMs: null,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: completedAt,
      providerFetchedAtMs: null,
    });
    expect(lastAllowedB2).toBe(completedAt);
    expect(lastAllowedB4).toBe(completedAt);
  });

  it('4 FAILURE correlation does not advance lastAllowed', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      metrics,
    );
    const pre = await service.observePrePoll(baseCtx);
    await service.observePollFailure({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: pre!.opportunityId,
      realPollId: 'poll-fail-1',
    });
    expect(lastAllowedB2).toBe(0);
    expect(repository.updateFailedPollOutcome).toHaveBeenCalled();
  });

  it('5 V2 offline replay equivalence on synthetic invalid-run slice', () => {
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
    const allowB4 = (last: number, nowMs: number) =>
      evaluateP25ApdB4V1Core({
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
    let offlineB4 = 0;
    let liveB2 = 0;
    let liveB4 = 0;
    let b2Div = 0;
    let b4Div = 0;

    for (const t of schedulerTimes) {
      const offB2 = allowB2(offlineB2, t);
      const offB4 = allowB4(offlineB4, t);
      const liveDecB2 = allowB2(liveB2, t);
      const liveDecB4 = allowB4(liveB4, t);

      if (offB2 !== liveDecB2) b2Div++;
      if (offB4 !== liveDecB4) b4Div++;

      const pollsBefore = pollTimes.filter((p) => p <= t && p > liveB2);
      if (pollsBefore.length) {
        const pt = Math.max(...pollsBefore);
        const c = {
          reconciliation: true,
          lastAllowedMs: liveB2,
          lastLvSourceMs: lv,
          nowMs: pt,
        };
        if (allowB2(liveB2, pt)) liveB2 = pt;
      }
      const pollsBefore4 = pollTimes.filter((p) => p <= t && p > liveB4);
      if (pollsBefore4.length) {
        const pt = Math.max(...pollsBefore4);
        if (allowB4(liveB4, pt)) liveB4 = pt;
      }

      for (const p of pollTimes) {
        if (p <= t && p > offlineB2 && allowB2(offlineB2, p)) offlineB2 = p;
        if (p <= t && p > offlineB4 && allowB4(offlineB4, p)) offlineB4 = p;
      }
    }

    expect(b2Div).toBe(0);
    expect(b4Div).toBe(0);
    expect(liveB2).toBe(offlineB2);
    expect(liveB4).toBe(offlineB4);
  });
});

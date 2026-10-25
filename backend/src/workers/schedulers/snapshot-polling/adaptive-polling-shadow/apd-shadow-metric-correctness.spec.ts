import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import {
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { mockActivationEpochServiceForCohort } from './apd-shadow-test-epoch.helper';
import { apdShadowBaselinePollEvidenceForTests } from './apd-shadow-test-baseline-evidence.helper';

describe('apd-shadow metric correctness (post-poll)', () => {
  const cohort: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [{ organizationId: 'org-1', vehicleId: 'veh-1' }],
  };

  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    opportunityId: 'opp-1',
    realPollId: 'poll-1',
    pollStartedAtMs: 1_000_000,
    pollCompletedAtMs: 1_001_000,
    realPollVisibleLvSourceAtMs: null,
    previousLvSourceMs: 900_000,
    baselineLvProviderSourceMs: 950_000,
    previousTopLevelSourceMs: 800_000,
    newTopLevelSourceMs: 800_000,
    providerFetchedAtMs: null,
  };

  function buildService(overrides: {
    repository?: Partial<AdaptivePollingShadowRepository>;
    metrics?: Partial<AdaptivePollingShadowMetricsService>;
  } = {}) {
    const repository = {
      findPrePollDecisionForOpportunity: jest.fn().mockResolvedValue({
        decision: 'WOULD_SKIP',
        reconciliation: true,
      }),
      findExistingObservationalOutcomeForOpportunity: jest
        .fn()
        .mockResolvedValue(null),
      updateSuccessfulPollOutcome: jest.fn().mockResolvedValue(1),
      promoteNewLvSourceObservedIfAbsent: jest.fn().mockResolvedValue(1),
      promoteNewTopLevelSourceObservedIfAbsent: jest.fn().mockResolvedValue(0),
      ...overrides.repository,
    } as unknown as AdaptivePollingShadowRepository;

    const metrics = {
      recordInformativeRealPoll: jest.fn(),
      recordSkippedInformative: jest.fn(),
      recordFailure: jest.fn(),
      setEnabled: jest.fn(),
      setCohortMemberCount: jest.fn(),
      setCohortConfigFingerprint: jest.fn(),
      recordDecision: jest.fn(),
      recordCohortExcluded: jest.fn(),
      recordEpochExcluded: jest.fn(),
      ...overrides.metrics,
    } as unknown as AdaptivePollingShadowMetricsService;

    const prisma = { dimoPollLog: { findFirst: jest.fn().mockResolvedValue(null) } };

    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      mockActivationEpochServiceForCohort(cohort, 'org-1'),
      apdShadowBaselinePollEvidenceForTests(prisma as never, metrics),
      metrics,
    );

    return { service, repository, metrics };
  }

  beforeEach(() => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify(cohort);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
  });

  it('recordInformativeRealPoll once per physical poll across B2 and B4', async () => {
    const { service, metrics } = buildService();
    await service.observePostPoll(baseCtx);
    expect(metrics.recordInformativeRealPoll).toHaveBeenCalledTimes(1);
    expect(metrics.recordInformativeRealPoll).toHaveBeenCalledWith('lv');
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(2);
  });

  it('does not emit success counters when durable persist returns count 0', async () => {
    const { service, metrics } = buildService({
      repository: {
        updateSuccessfulPollOutcome: jest.fn().mockResolvedValue(0),
      },
    });
    await service.observePostPoll(baseCtx);
    expect(metrics.recordInformativeRealPoll).not.toHaveBeenCalled();
    expect(metrics.recordSkippedInformative).not.toHaveBeenCalled();
  });

  it('retry after durable LV does not re-count promote or informative poll', async () => {
    const existing = {
      newLvSourceObserved: true,
      newTopLevelSourceObserved: false,
      additionalDiscoveryDelayMs: null,
      simulatedNextPollAt: null,
      simulatedDiscoveryAt: null,
    };
    const { service, metrics, repository } = buildService({
      repository: {
        findExistingObservationalOutcomeForOpportunity: jest
          .fn()
          .mockResolvedValue(existing),
        promoteNewLvSourceObservedIfAbsent: jest.fn().mockResolvedValue(0),
      },
    });
    await service.observePostPoll(baseCtx);
    expect(repository.promoteNewLvSourceObservedIfAbsent).not.toHaveBeenCalled();
    expect(metrics.recordInformativeRealPoll).not.toHaveBeenCalled();
    expect(metrics.recordSkippedInformative).not.toHaveBeenCalled();
  });

  it('concurrent post-poll: promote guard limits loss counting per policy row', async () => {
    const promotedPolicies = new Set<string>();
    const { service, metrics } = buildService({
      repository: {
        promoteNewLvSourceObservedIfAbsent: jest.fn().mockImplementation(
          async (input: { policyVersion: string }) => {
            if (promotedPolicies.has(input.policyVersion)) {
              return 0;
            }
            promotedPolicies.add(input.policyVersion);
            return 1;
          },
        ),
      },
    });
    await Promise.all([
      service.observePostPoll(baseCtx),
      service.observePostPoll(baseCtx),
    ]);
    expect(metrics.recordInformativeRealPoll).toHaveBeenCalledTimes(1);
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(2);
  });
});

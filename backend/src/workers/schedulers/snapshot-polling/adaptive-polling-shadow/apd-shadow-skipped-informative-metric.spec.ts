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

describe('apd-shadow skipped-informative metric wiring', () => {
  const cohort: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [{ organizationId: 'org-1', vehicleId: 'veh-1' }],
  };

  const repository = {
    upsertPrePollDecision: jest.fn(),
    resolveLastAllowedPollStartMs: jest.fn().mockResolvedValue(0),
    resolveSimulatedLastLvSourceMs: jest.fn().mockResolvedValue(null),
    findPrePollDecisionForOpportunity: jest.fn().mockResolvedValue({
      decision: 'WOULD_SKIP',
      reconciliation: true,
    }),
    findExistingObservationalOutcomeForOpportunity: jest
      .fn()
      .mockResolvedValue(null),
    updateSuccessfulPollOutcome: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdaptivePollingShadowRepository;

  const metrics = {
    recordInformativeRealPoll: jest.fn(),
    recordSkippedInformative: jest.fn(),
    setEnabled: jest.fn(),
    setCohortMemberCount: jest.fn(),
    setCohortConfigFingerprint: jest.fn(),
    recordDecision: jest.fn(),
    recordFailure: jest.fn(),
    recordCohortExcluded: jest.fn(),
    recordEpochExcluded: jest.fn(),
  } as unknown as AdaptivePollingShadowMetricsService;

  const prisma = {
    dimoPollLog: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  beforeEach(() => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify(cohort);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
  });

  it('increments skipped-informative per policy when WOULD_SKIP and payload LV advance', async () => {
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      mockActivationEpochServiceForCohort(cohort, 'org-1'),
      apdShadowBaselinePollEvidenceForTests(prisma as never, metrics),
      metrics,
    );

    await service.observePostPoll({
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
    });

    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(2);
    expect(metrics.recordSkippedInformative).toHaveBeenCalledWith(
      expect.stringContaining('B2'),
      'lv',
    );
    expect(metrics.recordSkippedInformative).toHaveBeenCalledWith(
      expect.stringContaining('B4'),
      'lv',
    );
    expect(repository.updateSuccessfulPollOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        realPollVisibleLvSourceAt: null,
        patch: expect.objectContaining({ newLvSourceObserved: true }),
      }),
    );
  });
});

import {
  ApdShadowActivationEpochLifecycle,
  BusinessType,
  FuelType,
  PrismaClient,
} from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  computeApdShadowCohortFingerprintSha256,
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';
import {
  P25_APD_SHADOW_EXECUTION_V2,
  P25_APD_SHADOW_EXECUTION_V2_1,
  P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
} from './p25-apd-shadow-execution-versions';
import { mockActivationEpochServiceForCohort } from './apd-shadow-test-epoch.helper';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APDS-9.5B LV bootstrap (Postgres integration)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);

  let organizationId = '';
  let vehicleId = '';
  let vehicleIdOther = '';
  let epochId = '';
  let cohortFingerprint = '';
  const activatedAt = new Date('2026-10-08T20:13:28.270Z');
  const cleanup: Array<{
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
  }> = [];

  const cohort: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [],
  };

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { companyName: 'APDS_95B_BOOTSTRAP_ORG', businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const veh = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Bootstrap',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: 'apd-bootstrap-a',
      },
      select: { id: true },
    });
    vehicleId = veh.id;
    const vehB = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Bootstrap',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: 'apd-bootstrap-b',
      },
      select: { id: true },
    });
    vehicleIdOther = vehB.id;
    cohort.members = [
      { organizationId, vehicleId },
      { organizationId, vehicleId: vehicleIdOther },
    ];
    cohortFingerprint = computeApdShadowCohortFingerprintSha256(cohort);

    const epoch = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(cohortFingerprint),
        organizationId,
        cohortConfigFingerprintSha256: cohortFingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt,
      },
      select: { id: true },
    });
    epochId = epoch.id;

    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify(cohort);
  });

  afterAll(async () => {
    for (const key of cleanup) {
      await prisma.apdShadowReconciliationDecision.deleteMany({ where: key });
    }
    await prisma.apdShadowActivationEpoch.deleteMany({ where: { id: epochId } });
    await prisma.vehicle.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
    await prisma.$disconnect();
  });

  function track(organizationId: string, vehicleId: string, opportunityId: string) {
    cleanup.push({ organizationId, vehicleId, opportunityId });
  }

  it('cold start: forced-missing poll seeds simulated LV (V2.1) without advancing lastAllowed', async () => {
    const decisionAtMs = Date.parse('2026-10-08T21:00:00.000Z');
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs,
      origin: 'BOOTSTRAP_TEST',
    });
    track(organizationId, vehicleId, opportunityId);

    const epochService = mockActivationEpochServiceForCohort(cohort, organizationId, {
      id: epochId,
      activatedAt,
      cohortConfigFingerprintSha256: cohortFingerprint,
    });
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      epochService,
    );

    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
      reconciliation: true,
    });
    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B4_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
      reconciliation: true,
    });

    const visibleLvMs = decisionAtMs - 5_000;
    const completedAtMs = decisionAtMs + 2_000;
    await service.observePostPoll({
      organizationId,
      vehicleId,
      opportunityId,
      realPollId: '00000000-0000-4000-8000-000000000101',
      pollStartedAtMs: decisionAtMs,
      pollCompletedAtMs: completedAtMs,
      realPollVisibleLvSourceAtMs: visibleLvMs,
      previousLvSourceMs: null,
      newLvSourceMs: visibleLvMs,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: completedAtMs,
      providerFetchedAtMs: null,
    });

    const b2 = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(b2?.realPollVisibleLvSourceAt?.getTime()).toBe(visibleLvMs);
    expect(b2?.shadowExecutionVersion).toBe(P25_APD_SHADOW_EXECUTION_V2_1);

    const seeded = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochId,
    });
    expect(seeded).toBe(visibleLvMs);

    const lastAllowed = await repository.resolveLastAllowedPollStartMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochId,
    });
    expect(lastAllowed).toBe(0);
  });

  it('restart: new repository instance reads same simulated LV from DB', async () => {
    const decisionAtMs = Date.parse('2026-10-08T21:00:00.000Z');
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs,
      origin: 'BOOTSTRAP_TEST',
    });
    const repo2 = new AdaptivePollingShadowRepository(prisma as never);
    const lv = await repo2.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochId,
    });
    expect(lv).toBe(decisionAtMs - 5_000);
  });

  it('R9 advancing path still persists visible LV under V2 semantics', async () => {
    const decisionAtMs = Date.parse('2026-10-08T21:05:00.000Z');
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId: vehicleIdOther,
      decisionAtMs,
      origin: 'R9_BOOTSTRAP_REGRESSION',
    });
    track(organizationId, vehicleIdOther, opportunityId);

    const epochService = mockActivationEpochServiceForCohort(cohort, organizationId, {
      id: epochId,
      activatedAt,
      cohortConfigFingerprintSha256: cohortFingerprint,
    });
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      epochService,
    );

    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'IMMEDIATE_SNAPSHOT_REQUIRED',
      reason: 'R9_PROVIDER_WAKE',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: true,
    });
    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B4_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'IMMEDIATE_SNAPSHOT_REQUIRED',
      reason: 'R9_PROVIDER_WAKE',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: true,
    });

    const visibleLvMs = decisionAtMs - 1_000;
    await service.observePostPoll({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      realPollId: '00000000-0000-4000-8000-000000000102',
      pollStartedAtMs: decisionAtMs,
      pollCompletedAtMs: decisionAtMs + 1_500,
      realPollVisibleLvSourceAtMs: visibleLvMs,
      previousLvSourceMs: null,
      newLvSourceMs: visibleLvMs,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });

    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(row?.realPollVisibleLvSourceAt?.getTime()).toBe(visibleLvMs);
    expect(row?.shadowExecutionVersion).toBe(P25_APD_SHADOW_EXECUTION_V2);
  });

  it('successful poll without visible LV remains fail-closed', async () => {
    const decisionAtMs = Date.parse('2026-10-08T21:10:00.000Z');
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId: vehicleIdOther,
      decisionAtMs,
      origin: 'NO_LV_FAIL_CLOSED',
    });
    track(organizationId, vehicleIdOther, opportunityId);

    const epochService = mockActivationEpochServiceForCohort(cohort, organizationId, {
      id: epochId,
      activatedAt,
      cohortConfigFingerprintSha256: cohortFingerprint,
    });
    const service = new AdaptivePollingShadowService(
      prisma as never,
      repository,
      epochService,
    );

    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: true,
    });
    await repository.upsertPrePollDecision({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      decisionAt: new Date(decisionAtMs),
      activationEpochId: epochId,
      policyVersion: P25_APD_B4_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: true,
    });

    await service.observePostPoll({
      organizationId,
      vehicleId: vehicleIdOther,
      opportunityId,
      realPollId: '00000000-0000-4000-8000-000000000103',
      pollStartedAtMs: decisionAtMs,
      pollCompletedAtMs: decisionAtMs + 1_000,
      realPollVisibleLvSourceAtMs: null,
      previousLvSourceMs: null,
      newLvSourceMs: null,
      previousTopLevelSourceMs: null,
      newTopLevelSourceMs: null,
      providerFetchedAtMs: null,
    });

    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(row?.realPollVisibleLvSourceAt).toBeNull();
  });
});

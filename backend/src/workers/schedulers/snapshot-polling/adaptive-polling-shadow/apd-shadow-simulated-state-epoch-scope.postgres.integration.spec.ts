import {
  ApdShadowActivationEpochLifecycle,
  BusinessType,
  FuelType,
  PrismaClient,
} from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import {
  P25_APD_SHADOW_EXECUTION_V2,
  P25_APD_SHADOW_EXECUTION_V2_1,
} from './p25-apd-shadow-execution-versions';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';
import { computeApdShadowCohortFingerprintSha256 } from './adaptive-polling-shadow-cohort.config';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APDS-9.5B simulated state epoch scope (Postgres)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);

  let organizationId = '';
  let organizationIdOther = '';
  let vehicleId = '';
  let vehicleIdOtherOrg = '';
  let epochA = '';
  let epochB = '';
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
      data: { companyName: 'APDS_95B_EPOCH_SCOPE_ORG', businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const orgB = await prisma.organization.create({
      data: { companyName: 'APDS_95B_EPOCH_SCOPE_ORG_B', businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationIdOther = orgB.id;

    const veh = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Epoch',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: 'apd-epoch-scope-a',
      },
      select: { id: true },
    });
    vehicleId = veh.id;
    const vehB = await prisma.vehicle.create({
      data: {
        organizationId: organizationIdOther,
        make: 'Test',
        model: 'Epoch',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: 'apd-epoch-scope-b',
      },
      select: { id: true },
    });
    vehicleIdOtherOrg = vehB.id;
    cohort.members = [
      { organizationId, vehicleId },
      { organizationId: organizationIdOther, vehicleId: vehicleIdOtherOrg },
    ];
    const fp = computeApdShadowCohortFingerprintSha256(cohort);

    const rowA = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(`${fp}-epoch-a`),
        organizationId,
        cohortConfigFingerprintSha256: `${fp}-epoch-a`,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.CLOSED,
        activatedAt: new Date('2026-10-01T00:00:00.000Z'),
        closedAt: new Date('2026-10-07T00:00:00.000Z'),
      },
      select: { id: true },
    });
    epochA = rowA.id;
    const rowB = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(`${fp}-epoch-b`),
        organizationId,
        cohortConfigFingerprintSha256: `${fp}-epoch-b`,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: new Date('2026-10-08T20:13:28.270Z'),
      },
      select: { id: true },
    });
    epochB = rowB.id;
  });

  afterAll(async () => {
    for (const key of cleanup) {
      await prisma.apdShadowReconciliationDecision.deleteMany({ where: key });
    }
    await prisma.apdShadowActivationEpoch.deleteMany({
      where: { id: { in: [epochA, epochB] } },
    });
    await prisma.vehicle.deleteMany({
      where: { organizationId: { in: [organizationId, organizationIdOther] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, organizationIdOther] } },
    });
    await prisma.$disconnect();
  });

  function track(organizationId: string, vehicleId: string, opportunityId: string) {
    cleanup.push({ organizationId, vehicleId, opportunityId });
  }

  async function seedLvRowDirect(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    activationEpochId: string | null;
    policyVersion: string;
    visibleLvMs: number;
    pollStartMs: number;
    executionVersion: string;
  }) {
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        decisionAt: new Date(input.pollStartMs),
        activationEpochId: input.activationEpochId,
        policyVersion: input.policyVersion,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'SPARSE_IRREGULAR',
        decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
        reason: 'MISSING_LV_SOURCE_TIMESTAMP',
        shadowExecutionVersion: input.executionVersion,
        reconciliation: true,
        realPollStatus: 'SUCCESS',
        realPollId: '00000000-0000-4000-8000-000000000201',
        realPollStartedAt: new Date(input.pollStartMs),
        realPollCompletedAt: new Date(input.pollStartMs + 2_000),
        realPollVisibleLvSourceAt: new Date(input.visibleLvMs),
      },
    });
  }

  async function seedLvRowActiveEpoch(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    activationEpochId: string;
    policyVersion: string;
    visibleLvMs: number;
    pollStartMs: number;
    executionVersion: string;
  }) {
    await repository.upsertPrePollDecision({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      opportunityId: input.opportunityId,
      decisionAt: new Date(input.pollStartMs),
      activationEpochId: input.activationEpochId,
      policyVersion: input.policyVersion,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      shadowExecutionVersion: input.executionVersion,
      reconciliation: true,
    });
    await repository.updateSuccessfulPollOutcome({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      opportunityId: input.opportunityId,
      policyVersion: input.policyVersion,
      activationEpochId: input.activationEpochId,
      realPollId: '00000000-0000-4000-8000-000000000202',
      realPollStartedAt: new Date(input.pollStartMs),
      realPollCompletedAt: new Date(input.pollStartMs + 2_000),
      realPollVisibleLvSourceAt: new Date(input.visibleLvMs),
      patch: {},
    });
  }

  it('excludes legacy NULL-epoch LV from active epoch simulated state', async () => {
    const t = Date.parse('2026-10-08T22:00:00.000Z');
    const oppLegacy = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: t,
      origin: 'LEGACY_NULL_EPOCH',
    });
    track(organizationId, vehicleId, oppLegacy);
    await seedLvRowDirect({
      organizationId,
      vehicleId,
      opportunityId: oppLegacy,
      activationEpochId: null,
      policyVersion: P25_APD_B2_V1,
      visibleLvMs: t - 10_000,
      pollStartMs: t,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2,
    });
    const lv = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochB,
    });
    expect(lv).toBeNull();
  });

  it('does not leak LV from closed epoch A into active epoch B', async () => {
    const tA = Date.parse('2026-10-06T12:00:00.000Z');
    const oppA = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: tA,
      origin: 'CLOSED_EPOCH_A',
    });
    track(organizationId, vehicleId, oppA);
    await seedLvRowDirect({
      organizationId,
      vehicleId,
      opportunityId: oppA,
      activationEpochId: epochA,
      policyVersion: P25_APD_B2_V1,
      visibleLvMs: tA - 5_000,
      pollStartMs: tA,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2,
    });

    const tB = Date.parse('2026-10-08T22:05:00.000Z');
    const oppB = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: tB,
      origin: 'ACTIVE_EPOCH_B',
    });
    track(organizationId, vehicleId, oppB);
    await seedLvRowActiveEpoch({
      organizationId,
      vehicleId,
      opportunityId: oppB,
      activationEpochId: epochB,
      policyVersion: P25_APD_B2_V1,
      visibleLvMs: tB - 3_000,
      pollStartMs: tB,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2_1,
    });

    const lv = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochB,
    });
    expect(lv).toBe(tB - 3_000);
  });

  it('isolates B2 vs B4 policy LV state', async () => {
    const t = Date.parse('2026-10-08T22:10:00.000Z');
    const opp = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: t,
      origin: 'POLICY_ISOLATION',
    });
    track(organizationId, vehicleId, opp);
    await seedLvRowActiveEpoch({
      organizationId,
      vehicleId,
      opportunityId: opp,
      activationEpochId: epochB,
      policyVersion: P25_APD_B2_V1,
      visibleLvMs: t - 1_000,
      pollStartMs: t,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2_1,
    });
    const oppB4 = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: t + 1,
      origin: 'POLICY_ISOLATION_B4',
    });
    track(organizationId, vehicleId, oppB4);
    await seedLvRowActiveEpoch({
      organizationId,
      vehicleId,
      opportunityId: oppB4,
      activationEpochId: epochB,
      policyVersion: P25_APD_B4_V1,
      visibleLvMs: t - 2_000,
      pollStartMs: t + 1,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2_1,
    });
    const b2 = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochB,
    });
    const b4 = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B4_V1,
      activationEpochId: epochB,
    });
    expect(b2).toBe(t - 1_000);
    expect(b4).toBe(t - 2_000);
  });

  it('does not leak LV across organizations on same vehicle id pattern', async () => {
    const t = Date.parse('2026-10-08T22:15:00.000Z');
    const oppOther = buildApdShadowOpportunityId({
      organizationId: organizationIdOther,
      vehicleId: vehicleIdOtherOrg,
      decisionAtMs: t,
      origin: 'TENANT_OTHER',
    });
    track(organizationIdOther, vehicleIdOtherOrg, oppOther);
    await seedLvRowDirect({
      organizationId: organizationIdOther,
      vehicleId: vehicleIdOtherOrg,
      opportunityId: oppOther,
      activationEpochId: null,
      policyVersion: P25_APD_B2_V1,
      visibleLvMs: t - 4_000,
      pollStartMs: t,
      executionVersion: P25_APD_SHADOW_EXECUTION_V2_1,
    });
    const lv = await repository.resolveSimulatedLastLvSourceMs({
      organizationId,
      vehicleId,
      policyVersion: P25_APD_B2_V1,
      activationEpochId: epochB,
    });
    expect(lv).not.toBe(t - 4_000);
  });
});

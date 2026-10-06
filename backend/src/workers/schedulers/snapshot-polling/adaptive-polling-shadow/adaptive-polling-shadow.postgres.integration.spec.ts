import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../adaptive-polling-policy/p25-apd-policy-versions';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

function baseRow(input: {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  policyVersion: string;
}) {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    opportunityId: input.opportunityId,
    decisionAt: new Date(),
    policyVersion: input.policyVersion,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    profileClass: 'STABLE_PERIODIC',
    decision: 'WOULD_POLL',
    reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
  };
}

describePg('ApdShadowReconciliationDecision Postgres integration (APDS-7.1)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);

  let organizationId = '';
  let vehicleId = '';
  let vehicleIdSameOrg = '';
  let organizationIdOther = '';

  const cleanupKeys: Array<{
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
  }> = [];

  beforeAll(async () => {
    const ensureOrg = async (name: string) => {
      const existing = await prisma.organization.findFirst({
        where: { companyName: name },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await prisma.organization.create({
        data: {
          companyName: name,
          businessType: BusinessType.RENTAL,
        },
        select: { id: true },
      });
      return created.id;
    };

    const ensureVehicle = async (orgId: string, label: string) => {
      const existing = await prisma.vehicle.findFirst({
        where: { organizationId: orgId, vehicleName: label },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await prisma.vehicle.create({
        data: {
          organizationId: orgId,
          make: 'Test',
          model: 'APD',
          year: 2026,
          fuelType: FuelType.ELECTRIC,
          vehicleName: label,
        },
        select: { id: true },
      });
      return created.id;
    };

    organizationId = await ensureOrg('APD_PG_INTEGRATION_ORG_A');
    organizationIdOther = await ensureOrg('APD_PG_INTEGRATION_ORG_B');
    vehicleId = await ensureVehicle(organizationId, 'apd-veh-a');
    vehicleIdSameOrg = await ensureVehicle(organizationId, 'apd-veh-b');
  });

  afterAll(async () => {
    for (const key of cleanupKeys) {
      await prisma.apdShadowReconciliationDecision.deleteMany({
        where: key,
      });
    }
    await prisma.$disconnect();
  });

  function trackCleanup(
    organizationId: string,
    vehicleId: string,
    opportunityId: string,
  ) {
    cleanupKeys.push({ organizationId, vehicleId, opportunityId });
  }

  it('1 first insert B2', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now(),
      origin: 'INTEGRATION_TEST_B2_FIRST',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      }),
    );
    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      },
    });
    expect(row?.policyVersion).toBe(P25_APD_B2_V1);
  });

  it('2 first insert B4', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 1,
      origin: 'INTEGRATION_TEST_B4_FIRST',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B4_V1,
      }),
    );
    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B4_V1 },
    });
    expect(row?.policyVersion).toBe(P25_APD_B4_V1);
  });

  it('3 duplicate same opportunity/policy upsert converges to one row', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 2,
      origin: 'INTEGRATION_TEST_DUP_UPSERT',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    const row = baseRow({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B2_V1,
    });
    await repository.upsertPrePollDecision(row);
    await repository.upsertPrePollDecision({
      ...row,
      decision: 'WOULD_SKIP',
      reason: 'MIN_INTERVAL_NOT_ELAPSED',
    });
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: {
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      },
    });
    expect(count).toBe(1);
    const latest = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(latest?.decision).toBe('WOULD_SKIP');
  });

  it('4 concurrent identical insert race → single row', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 3,
      origin: 'INTEGRATION_TEST_RACE_INSERT',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    const row = baseRow({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B2_V1,
    });
    await Promise.all([
      repository.upsertPrePollDecision(row),
      repository.upsertPrePollDecision(row),
      repository.upsertPrePollDecision(row),
    ]);
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: {
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      },
    });
    expect(count).toBe(1);
  });

  it('5 concurrent outcome patch race → single row', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 4,
      origin: 'INTEGRATION_TEST_RACE_OUTCOME',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      }),
    );
    const completedAt = new Date('2026-10-03T12:00:00.000Z');
    await Promise.all([
      repository.updateOutcome({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
        patch: {
          realPollCompletedAt: completedAt,
          newLvSourceObserved: true,
        },
      }),
      repository.updateOutcome({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
        patch: {
          newObdSourceObserved: true,
          legacyAssessmentImpact: 'NONE',
        },
      }),
    ]);
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(count).toBe(1);
    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(row?.realPollCompletedAt?.toISOString()).toBe(completedAt.toISOString());
    expect(row?.newLvSourceObserved).toBe(true);
    expect(row?.newObdSourceObserved).toBe(true);
  });

  it('6 B2 and B4 coexist for same opportunity', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 5,
      origin: 'INTEGRATION_TEST_DUAL_POLICY',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      }),
    );
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B4_V1,
      }),
    );
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: { organizationId, vehicleId, opportunityId },
    });
    expect(count).toBe(2);
  });

  it('7 same opportunityId on different vehicles does not collide', async () => {
    const opportunityId = 'shared-opportunity-id-cross-vehicle-test';
    trackCleanup(organizationId, vehicleId, opportunityId);
    if (vehicleIdSameOrg !== vehicleId) {
      trackCleanup(organizationId, vehicleIdSameOrg, opportunityId);
    }
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      }),
    );
    if (vehicleIdSameOrg !== vehicleId) {
      await repository.upsertPrePollDecision(
        baseRow({
          organizationId,
          vehicleId: vehicleIdSameOrg,
          opportunityId,
          policyVersion: P25_APD_B2_V1,
        }),
      );
      const count = await prisma.apdShadowReconciliationDecision.count({
        where: { organizationId, opportunityId, policyVersion: P25_APD_B2_V1 },
      });
      expect(count).toBe(2);
    } else {
      const count = await prisma.apdShadowReconciliationDecision.count({
        where: { organizationId, opportunityId, policyVersion: P25_APD_B2_V1 },
      });
      expect(count).toBe(1);
    }
  });

  it('8 cross-organization vehicle binding fails tenant-safe (FK)', async () => {
    if (organizationIdOther === organizationId) {
      return;
    }
    const opportunityId = buildApdShadowOpportunityId({
      organizationId: organizationIdOther,
      vehicleId,
      decisionAtMs: Date.now() + 6,
      origin: 'INTEGRATION_TEST_CROSS_TENANT',
    });
    await expect(
      repository.upsertPrePollDecision(
        baseRow({
          organizationId: organizationIdOther,
          vehicleId,
          opportunityId,
          policyVersion: P25_APD_B2_V1,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('9 retry after interruption-style re-upsert converges', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 7,
      origin: 'INTEGRATION_TEST_RETRY',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    const row = baseRow({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B2_V1,
    });
    await repository.upsertPrePollDecision(row);
    await repository.upsertPrePollDecision(row);
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(count).toBe(1);
  });

  it('10 post-poll update does not create second semantic row', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 8,
      origin: 'INTEGRATION_TEST_POST_POLL',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      }),
    );
    await repository.updateOutcome({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B2_V1,
      patch: {
        realPollCompletedAt: new Date(),
        newLvSourceObserved: false,
      },
    });
    await repository.updateOutcome({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B2_V1,
      patch: {
        newLvSourceObserved: true,
        newLvSourceAt: new Date('2026-10-03T12:05:00.000Z'),
      },
    });
    const count = await prisma.apdShadowReconciliationDecision.count({
      where: { opportunityId, policyVersion: P25_APD_B2_V1 },
    });
    expect(count).toBe(1);
  });

  it('11 outcome patch updates existing row fields', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now() + 9,
      origin: 'INTEGRATION_TEST_OUTCOME_SEMANTICS',
    });
    trackCleanup(organizationId, vehicleId, opportunityId);
    await repository.upsertPrePollDecision(
      baseRow({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B4_V1,
      }),
    );
    const lvAt = new Date('2026-10-03T11:00:00.000Z');
    await repository.updateOutcome({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion: P25_APD_B4_V1,
      patch: {
        newLvSourceObserved: true,
        newLvSourceAt: lvAt,
        legacyCustomerImpact: 'NONE',
      },
    });
    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId, policyVersion: P25_APD_B4_V1 },
    });
    expect(row?.newLvSourceObserved).toBe(true);
    expect(row?.newLvSourceAt?.toISOString()).toBe(lvAt.toISOString());
  });

  it('12 duplicate semantic row count for test orgs is zero', async () => {
    const groups = await prisma.$queryRaw<
      Array<{ cnt: bigint }>
    >`SELECT COUNT(*)::bigint AS cnt FROM (
      SELECT organization_id, vehicle_id, opportunity_id, policy_version, COUNT(*) AS c
      FROM apd_shadow_reconciliation_decisions
      WHERE organization_id IN (${organizationId}::text, ${organizationIdOther}::text)
      GROUP BY organization_id, vehicle_id, opportunity_id, policy_version
      HAVING COUNT(*) > 1
    ) dup`;
    const duplicateSemanticRows = Number(groups[0]?.cnt ?? 0);
    expect(duplicateSemanticRows).toBe(0);
  });
});

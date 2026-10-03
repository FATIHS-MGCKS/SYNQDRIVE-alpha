import { PrismaClient } from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import { P25_APD_B2_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('ApdShadowReconciliationDecision idempotency', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);

  let organizationId = '';
  let vehicleId = '';

  beforeAll(async () => {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) throw new Error('No organization for integration test');
    organizationId = org.id;
    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new Error('No vehicle for integration test');
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DUPLICATE_SHADOW_ROW_RACE converges via unique key', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: Date.now(),
      origin: 'INTEGRATION_TEST',
    });
    const row = {
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt: new Date(),
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'STABLE_PERIODIC',
      decision: 'WOULD_POLL',
      reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
    };
    await Promise.all([
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
    await prisma.apdShadowReconciliationDecision.deleteMany({
      where: { organizationId, vehicleId, opportunityId },
    });
  });
});

import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
} from './adaptive-polling-shadow-cohort.config';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';
import { ApdShadowDecisionEpochInactiveError } from './apd-shadow-decision-epoch.errors';
import { P25_APD_SHADOW_EXECUTION_V2 } from './p25-apd-shadow-execution-versions';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APD shadow pause/close write-boundary race (APDS-9.3B)', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  let organizationId = '';
  let vehicleId = '';
  let epochId = '';
  let fingerprint = '';

  beforeAll(async () => {
    enableApdShadowEpochOpsAuthorityForTests();
    const org = await prismaA.organization.create({
      data: { companyName: `APD_RACE_ORG_${Date.now()}`, businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prismaA.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Race',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `race-${Date.now()}`,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
    fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    });
    const service = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'write-race',
      operatorRequestId: 'write-race-prepare',
    });
    const active = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `race-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'write-race-activate',
      operatorRequestId: 'write-race-activate',
    });
    epochId = active.id;
  });

  afterAll(async () => {
    await prismaA.apdShadowReconciliationDecision.deleteMany({
      where: { activationEpochId: epochId },
    });
    await prismaA.apdShadowActivationEpoch.deleteMany({ where: { id: epochId } });
    await prismaA.vehicle.deleteMany({ where: { organizationId } });
    await prismaA.organization.deleteMany({ where: { id: organizationId } });
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  function decisionRow(opportunityId: string) {
    return {
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt: new Date(),
      activationEpochId: epochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'test',
      profileClass: 'LTE_R1',
      decision: 'ALLOW',
      reason: 'race-test',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: false,
    };
  }

  it('PAUSE_WRITE_RACE: no create after pause commits on replica B', async () => {
    const repoA = new AdaptivePollingShadowRepository(prismaA as never);
    const serviceB = new ApdShadowActivationEpochService(prismaB as never);
    const opp = `opp-pause-${Date.now()}`;
    await serviceB.pauseEpoch(epochId, {
      operatorActor: 'integration-test',
      operationRequestId: 'pause-race-1',
      operationReason: 'pause-before-write',
      opsToken: 'test-token',
    });
    await expect(repoA.upsertPrePollDecision(decisionRow(opp))).rejects.toBeInstanceOf(
      ApdShadowDecisionEpochInactiveError,
    );
    const count = await prismaA.apdShadowReconciliationDecision.count({
      where: { opportunityId: opp },
    });
    expect(count).toBe(0);
  });

  it('CLOSE_WRITE_RACE: no create after close on replica B', async () => {
    const serviceA = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await serviceA.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'close-race-prepare',
      operatorRequestId: 'close-race-prepare',
    });
    const active = await serviceA.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `close-race-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'close-race-activate',
      operatorRequestId: 'close-race-activate',
    });
    const closeEpochId = active.id;
    const repoA = new AdaptivePollingShadowRepository(prismaA as never);
    const serviceB = new ApdShadowActivationEpochService(prismaB as never);
    const opp = `opp-close-${Date.now()}`;
    await serviceB.closeEpoch(closeEpochId, {
      operatorActor: 'integration-test',
      operationRequestId: 'close-race-1',
      operationReason: 'close-before-write',
      opsToken: 'test-token',
    });
    await expect(
      repoA.upsertPrePollDecision({
        ...decisionRow(opp),
        activationEpochId: closeEpochId,
      }),
    ).rejects.toBeInstanceOf(ApdShadowDecisionEpochInactiveError);
    await prismaA.apdShadowReconciliationDecision.deleteMany({
      where: { activationEpochId: closeEpochId },
    });
    await prismaA.apdShadowActivationEpoch.deleteMany({ where: { id: closeEpochId } });
  });
});

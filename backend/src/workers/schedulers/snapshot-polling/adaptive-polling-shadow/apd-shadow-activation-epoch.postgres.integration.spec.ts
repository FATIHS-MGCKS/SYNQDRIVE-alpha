import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('ApdShadowActivationEpoch Postgres integration (APDS-9.3)', () => {
  const prisma = new PrismaClient();
  let organizationId = '';
  const epochIds: string[] = [];

  beforeAll(async () => {
    enableApdShadowEpochOpsAuthorityForTests();
    const org =
      (await prisma.organization.findFirst({
        where: { companyName: 'APD_EPOCH_PG_ORG' },
        select: { id: true },
      })) ??
      (await prisma.organization.create({
        data: { companyName: 'APD_EPOCH_PG_ORG', businessType: BusinessType.RENTAL },
        select: { id: true },
      }));
    organizationId = org.id;
  });

  afterAll(async () => {
    for (const id of epochIds) {
      await prisma.apdShadowReconciliationDecision.deleteMany({
        where: { activationEpochId: id },
      });
      await prisma.apdShadowActivationEpoch.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  async function freshCohort(): Promise<{
    config: ApdShadowCohortConfig;
    fingerprint: string;
  }> {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Epoch',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `apd-epoch-${Date.now()}-${Math.random()}`,
      },
      select: { id: true },
    });
    const config: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId: vehicle.id }],
    };
    return {
      config,
      fingerprint: computeApdShadowCohortFingerprintSha256(config),
    };
  }

  it('duplicate activation request is idempotent', async () => {
    const { fingerprint } = await freshCohort();
    const service = new ApdShadowActivationEpochService(prisma as never);
    const prepared = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'prepare',
    });
    epochIds.push(prepared.id);

    const requestKey = `req-${Date.now()}-a`;
    const first = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: requestKey,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'activate',
    });
    const second = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: requestKey,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'activate-replay',
    });
    expect(second.id).toBe(first.id);
    expect(second.activatedAt.getTime()).toBe(first.activatedAt.getTime());
  });

  it('concurrent activation converges to one ACTIVE epoch per scope', async () => {
    const { fingerprint } = await freshCohort();
    const service = new ApdShadowActivationEpochService(prisma as never);
    const preparedA = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    const preparedB = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    epochIds.push(preparedA.id, preparedB.id);

    const results = await Promise.allSettled([
      service.activateEpoch({
        epochId: preparedA.id,
        activationRequestKey: `req-${Date.now()}-c1`,
        cohortOrganizationIds: [organizationId],
        cohortConfigFingerprintSha256: fingerprint,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        operatorActor: 'integration-test',
        operatorReason: 'race-a',
      }),
      service.activateEpoch({
        epochId: preparedB.id,
        activationRequestKey: `req-${Date.now()}-c2`,
        cohortOrganizationIds: [organizationId],
        cohortConfigFingerprintSha256: fingerprint,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        operatorActor: 'integration-test',
        operatorReason: 'race-b',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const activeCount = await prisma.apdShadowActivationEpoch.count({
      where: {
        cohortConfigFingerprintSha256: fingerprint,
        lifecycleState: 'ACTIVE',
      },
    });
    expect(activeCount).toBe(1);
  });
});

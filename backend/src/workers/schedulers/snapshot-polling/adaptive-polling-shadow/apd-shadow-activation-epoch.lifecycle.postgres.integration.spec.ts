import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
} from './adaptive-polling-shadow-cohort.config';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('ApdShadowActivationEpoch lifecycle + T0 timezone (APDS-9.3A)', () => {
  const prisma = new PrismaClient();
  const service = new ApdShadowActivationEpochService(prisma as never);
  let organizationId = '';
  let epochId = '';

  beforeAll(async () => {
    enableApdShadowEpochOpsAuthorityForTests();
    const org = await prisma.organization.create({
      data: { companyName: `APD_TZ_ORG_${Date.now()}`, businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Tz',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `tz-${Date.now()}`,
      },
      select: { id: true },
    });
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId: vehicle.id }],
    });
    const prepared = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'America/Los_Angeles'`);
    const active = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `tz-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration',
      operatorReason: 'tz',
    });
    epochId = active.id;
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
  });

  afterAll(async () => {
    await prisma.apdShadowActivationEpoch.deleteMany({ where: { id: epochId } });
    await prisma.vehicle.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('ACTIVE activatedAt is immutable (database trigger)', async () => {
    const row = await prisma.apdShadowActivationEpoch.findUnique({ where: { id: epochId } });
    expect(row?.activatedAt).not.toBeNull();
    const t0 = row!.activatedAt!;
    await expect(
      prisma.apdShadowActivationEpoch.update({
        where: { id: epochId },
        data: { activatedAt: new Date('1999-01-01T00:00:00.000Z') },
      }),
    ).rejects.toThrow(/immutable/i);
    const after = await prisma.apdShadowActivationEpoch.findUnique({ where: { id: epochId } });
    expect(after?.activatedAt?.getTime()).toBe(t0.getTime());
  });

  it('PAUSED retains T0', async () => {
    const before = await prisma.apdShadowActivationEpoch.findUnique({ where: { id: epochId } });
    await service.pauseEpoch(epochId);
    const after = await prisma.apdShadowActivationEpoch.findUnique({ where: { id: epochId } });
    expect(after?.lifecycleState).toBe('PAUSED');
    expect(after?.activatedAt?.getTime()).toBe(before?.activatedAt?.getTime());
  });
});

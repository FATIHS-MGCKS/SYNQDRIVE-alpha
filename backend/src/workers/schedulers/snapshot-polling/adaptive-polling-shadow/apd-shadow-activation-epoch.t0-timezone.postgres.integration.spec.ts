import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
} from './adaptive-polling-shadow-cohort.config';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';
import { APD_SHADOW_T0_CLOCK_TOLERANCE_MS } from './apd-shadow-epoch-t0.authority';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

const TIMEZONES = ['UTC', 'America/Los_Angeles', 'Europe/Berlin'] as const;

describePg('ApdShadow T0 database clock authority (APDS-9.3B)', () => {
  const prisma = new PrismaClient();
  const epochIds: string[] = [];

  beforeAll(() => {
    enableApdShadowEpochOpsAuthorityForTests();
  });

  afterAll(async () => {
    for (const id of epochIds) {
      await prisma.apdShadowActivationEpoch.deleteMany({ where: { id } });
    }
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    await prisma.$disconnect();
  });

  async function activateUnderTimezone(
    timeZone: string,
    label: string,
  ): Promise<{ offsetMs: number; activatedAt: Date }> {
    const org = await prisma.organization.create({
      data: {
        companyName: `APD_T0_${label}_${Date.now()}`,
        businessType: BusinessType.RENTAL,
      },
      select: { id: true },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        make: 'Test',
        model: 'T0',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `t0-${label}-${Date.now()}`,
      },
      select: { id: true },
    });
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: org.id, vehicleId: vehicle.id }],
    });
    const service = new ApdShadowActivationEpochService(prisma as never);
    const prepared = await service.prepareEpoch({
      organizationId: org.id,
      cohortOrganizationIds: [org.id],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 't0-timezone',
      operatorRequestId: `t0-${label}`,
    });
    epochIds.push(prepared.id);

    await prisma.$executeRawUnsafe(`SET TIME ZONE '${timeZone.replace(/'/g, '')}'`);
    const beforeDb = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
    const active = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `t0-req-${label}-${Date.now()}`,
      cohortOrganizationIds: [org.id],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 't0-timezone-activate',
      operatorRequestId: `t0-act-${label}`,
    });
    const afterDb = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);

    const midDbMs =
      (beforeDb[0]!.now.getTime() + afterDb[0]!.now.getTime()) / 2;
    const offsetMs = Math.abs(active.activatedAt.getTime() - midDbMs);
    await prisma.vehicle.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    return { offsetMs, activatedAt: active.activatedAt };
  }

  for (const tz of TIMEZONES) {
    it(`T0 aligns with database NOW() under session TZ=${tz}`, async () => {
      const { offsetMs } = await activateUnderTimezone(tz, tz.replace(/\W/g, '_'));
      expect(offsetMs).toBeLessThanOrEqual(APD_SHADOW_T0_CLOCK_TOLERANCE_MS);
    });
  }

  it('DST-sensitive Berlin winter date preserves parity', async () => {
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'Europe/Berlin'`);
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    const { offsetMs } = await activateUnderTimezone('Europe/Berlin', 'berlin_dst');
    expect(offsetMs).toBeLessThanOrEqual(APD_SHADOW_T0_CLOCK_TOLERANCE_MS);
  });
});

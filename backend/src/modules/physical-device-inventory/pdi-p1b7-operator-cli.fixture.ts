import { BusinessType, PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { insertDimoMirrorRaw } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { PDI_P1B7_AUTHORIZED_INTAKE } from './pdi-p1b7-manual-intake-operator.lib';

export async function seedPdiP1b7OperatorPreflightIdentity(prisma: PrismaClient): Promise<void> {
  await prisma.organization.upsert({
    where: { id: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId },
    create: {
      id: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId,
      companyName: 'PDI P1B7 operator test org',
      businessType: BusinessType.RENTAL,
    },
    update: {},
  });

  const dimoId = randomUUID();
  await insertDimoMirrorRaw(prisma, {
    id: dimoId,
    externalId: `0x${randomUUID().replace(/-/g, '')}`,
    tokenId: PDI_P1B7_AUTHORIZED_INTAKE.dimoToken,
    rawJson: {
      aftermarketDevice: { id: 'R1-test', serial: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber },
    },
  });

  const vin = `PDI${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type,
      dimo_vehicle_id, registry_lifecycle, created_at, updated_at
    ) VALUES (
      ${PDI_P1B7_AUTHORIZED_INTAKE.vehicleId}::uuid,
      ${PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId}::uuid,
      ${vin},
      'VW',
      'Tiguan',
      2022,
      'GASOLINE',
      'LTE_R1',
      ${dimoId},
      'ACTIVE'::"VehicleRegistryLifecycle",
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      dimo_vehicle_id = EXCLUDED.dimo_vehicle_id
  `;
}

export async function createOperatorTestMasterAdmin(prisma: PrismaClient): Promise<{
  id: string;
  email: string;
}> {
  const email = `pdi-operator-test-${randomUUID().slice(0, 8)}@acceptance.internal.synqdrive.eu`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'PDI Operator Test Master Admin',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: 'not-used',
    },
    select: { id: true, email: true },
  });
  return user;
}

export async function createInactiveSmokeStyleMasterAdmin(prisma: PrismaClient): Promise<{
  id: string;
  email: string;
}> {
  const email = `inactive-smoke-${randomUUID().slice(0, 8)}@acceptance.internal.synqdrive.eu`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Inactive Master Admin',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      status: UserStatus.INACTIVE,
      passwordHash: 'not-used',
    },
    select: { id: true, email: true },
  });
  return user;
}

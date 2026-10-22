import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

export type PdiDriftShadowPostgresFixture = {
  orgId: string;
  vehicleA: { id: string };
  vehicleB: { id: string };
  deviceA: { id: string; serial: string };
  deviceB: { id: string; serial: string };
  dimoA: { id: string; tokenId: number };
  dimoB: { id: string; tokenId: number };
};

const SCHEMA_SQL_PATH = join(__dirname, 'pdi-inventory-minimal-schema.sql');

export async function probePdiDriftShadowDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function ensurePdiInventorySchemaForDriftShadowTests(
  prisma: PrismaClient,
): Promise<void> {
  const reg = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.physical_devices') IS NOT NULL AS exists
  `;
  if (reg[0]?.exists) return;
  const sql = readFileSync(SCHEMA_SQL_PATH, 'utf8');
  await prisma.$executeRawUnsafe(sql);
}

export async function createPdiDriftShadowPostgresFixture(
  prisma: PrismaClient,
): Promise<PdiDriftShadowPostgresFixture> {
  await ensurePdiInventorySchemaForDriftShadowTests(prisma);

  const org = await prisma.organization.create({
    data: {
      companyName: `PDI drift shadow ${randomUUID()}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const tokenA = 290_000 + Math.floor(Math.random() * 10_000);
  const tokenB = tokenA + 1;
  const serialA = `R1-TEST-DRIFT-${randomUUID().slice(0, 8).toUpperCase()}`;
  const serialB = `R1-TEST-DRIFT-${randomUUID().slice(0, 8).toUpperCase()}`;

  const dimoA = await prisma.dimoVehicle.create({
    data: {
      externalId: String(tokenA),
      tokenId: tokenA,
      rawJson: { aftermarketDevice: { serial: serialA } },
      syncedAt: new Date(),
      connectionStatus: 'CONNECTED',
    },
    select: { id: true, tokenId: true },
  });
  const dimoB = await prisma.dimoVehicle.create({
    data: {
      externalId: String(tokenB),
      tokenId: tokenB,
      rawJson: { aftermarketDevice: { serial: serialB } },
      syncedAt: new Date(),
      connectionStatus: 'CONNECTED',
    },
    select: { id: true, tokenId: true },
  });

  const vehicleA = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoA.id,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0'),
      licensePlate: `DA-${randomUUID().slice(0, 6)}`,
      make: 'Test',
      model: 'DriftA',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
      hardwareType: 'LTE_R1',
    },
    select: { id: true },
  });
  const vehicleB = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoB.id,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0'),
      licensePlate: `DB-${randomUUID().slice(0, 6)}`,
      make: 'Test',
      model: 'DriftB',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
      hardwareType: 'LTE_R1',
    },
    select: { id: true },
  });

  const deviceAId = randomUUID();
  const deviceBId = randomUUID();
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO physical_devices (
      id, internal_inventory_number, manufacturer, model_code, serial_number,
      owner_organization_id, warehouse_location, status, identity_status,
      recorded_at, intake_source, created_at, updated_at
    ) VALUES (
      ${deviceAId}, ${`PDI-${deviceAId.slice(0, 12)}`}, 'Ruptela', 'RUPTELA_R1', ${serialA},
      ${org.id}, 'Test', 'INSTALLED', 'VERIFIED',
      ${now}, 'MANUAL_MASTER_ADMIN', ${now}, ${now}
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO physical_devices (
      id, internal_inventory_number, manufacturer, model_code, serial_number,
      owner_organization_id, warehouse_location, status, identity_status,
      recorded_at, intake_source, created_at, updated_at
    ) VALUES (
      ${deviceBId}, ${`PDI-${deviceBId.slice(0, 12)}`}, 'Ruptela', 'RUPTELA_R1', ${serialB},
      ${org.id}, 'Test', 'INSTALLED', 'VERIFIED',
      ${now}, 'MANUAL_MASTER_ADMIN', ${now}, ${now}
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO physical_device_assignments (
      id, physical_device_id, organization_id, vehicle_id, assignment_kind,
      effective_from, idempotency_key, created_at
    ) VALUES (
      ${randomUUID()}, ${deviceAId}, ${org.id}, ${vehicleA.id}, 'INSTALL',
      ${now}, ${`idem-${deviceAId}`}, ${now}
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO physical_device_assignments (
      id, physical_device_id, organization_id, vehicle_id, assignment_kind,
      effective_from, idempotency_key, created_at
    ) VALUES (
      ${randomUUID()}, ${deviceBId}, ${org.id}, ${vehicleB.id}, 'INSTALL',
      ${now}, ${`idem-${deviceBId}`}, ${now}
    )
  `;

  return {
    orgId: org.id,
    vehicleA,
    vehicleB,
    deviceA: { id: deviceAId, serial: serialA },
    deviceB: { id: deviceBId, serial: serialB },
    dimoA: { id: dimoA.id, tokenId: dimoA.tokenId! },
    dimoB: { id: dimoB.id, tokenId: dimoB.tokenId! },
  };
}

export async function cleanupPdiDriftShadowPostgresFixture(
  prisma: PrismaClient,
  fixture: PdiDriftShadowPostgresFixture,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM physical_device_assignments
    WHERE physical_device_id IN (${fixture.deviceA.id}, ${fixture.deviceB.id})
  `;
  await prisma.$executeRaw`
    DELETE FROM physical_devices WHERE id IN (${fixture.deviceA.id}, ${fixture.deviceB.id})
  `;
  await prisma.vehicle.deleteMany({
    where: { id: { in: [fixture.vehicleA.id, fixture.vehicleB.id] } },
  });
  await prisma.dimoVehicle.deleteMany({
    where: { id: { in: [fixture.dimoA.id, fixture.dimoB.id] } },
  });
  await prisma.organization.delete({ where: { id: fixture.orgId } }).catch(() => undefined);
}

export async function setDimoObservedSerial(
  prisma: PrismaClient,
  dimoVehicleId: string,
  serial: string,
): Promise<void> {
  await prisma.dimoVehicle.update({
    where: { id: dimoVehicleId },
    data: {
      rawJson: { aftermarketDevice: { serial } },
      syncedAt: new Date(),
    },
  });
}

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV,
} from '@config/connectivity-physical-state-runtime.config';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import { CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV } from '@config/connectivity-physical-state-shadow-pilot-scope.config';

export type PhysicalStatePilotScopeEntry = {
  organizationId: string;
  vehicleId: string;
  provider: string;
};

export type PhysicalStatePostgresFixture = {
  suffix: string;
  org: { id: string };
  vehicle: { id: string; organizationId: string };
  tokenId: number;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probePhysicalStateDatabase(): Promise<boolean> {
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

export async function createPhysicalStatePostgresFixture(
  prisma: PrismaClient,
): Promise<PhysicalStatePostgresFixture> {
  const suffix = uniqueSuffix();
  const tokenId = 180000 + Math.floor(Math.random() * 10000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Physical State PG ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `PS-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'PhysicalState',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
      hardwareType: 'LTE_R1',
    },
    select: { id: true, organizationId: true },
  });

  return { suffix, org, vehicle, tokenId };
}

export function pilotScopeForFixture(
  fixture: PhysicalStatePostgresFixture,
  provider = 'DIMO',
): PhysicalStatePilotScopeEntry {
  return {
    organizationId: fixture.org.id,
    vehicleId: fixture.vehicle.id,
    provider,
  };
}

export function enablePhysicalStateStatefulShadowEnv(
  pilotScopes: PhysicalStatePilotScopeEntry[] = [],
): void {
  process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV] = 'false';
  process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV] = JSON.stringify(
    pilotScopes,
  );
}

export function enablePhysicalStateStatefulShadowEnvForFixture(
  fixture: PhysicalStatePostgresFixture,
  provider = 'DIMO',
): void {
  enablePhysicalStateStatefulShadowEnv([pilotScopeForFixture(fixture, provider)]);
}

export function disablePhysicalStateStatefulShadowEnv(): void {
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV];
}

export async function cleanupPhysicalStatePostgresFixture(
  prisma: PrismaClient,
  fixture: PhysicalStatePostgresFixture,
): Promise<void> {
  await prisma.deviceConnectionPhysicalStateShadowObservation.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.deviceConnectionPhysicalStateActionOutbox.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.deviceConnectionPhysicalAuthorityCutover.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.deviceConnectionPhysicalStateTransition.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.deviceConnectionPhysicalState.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.deviceConnectionEpisode.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.dimoDeviceConnectionEvent.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
  await prisma.organization.delete({ where: { id: fixture.org.id } });
}

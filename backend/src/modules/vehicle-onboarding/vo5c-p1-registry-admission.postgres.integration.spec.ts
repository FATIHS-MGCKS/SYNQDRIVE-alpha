/**
 * VO-5C-P1.1 registry ACTIVE admission gates (PostgreSQL).
 */
import { BadRequestException } from '@nestjs/common';
import { BusinessType, PrismaClient, ProductSlug, TripStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TripDecisionEngine } from '@modules/vehicle-intelligence/trips/decision/trip-decision.engine';
import {
  assertVehicleRegistryActiveForOperationalAdmission,
  VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE,
} from '@modules/vehicles/registry/vehicle-registry-admission';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run = process.env.VO5C_P1_OFFBOARD_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5C-ADM ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createActiveVehicle(prisma: PrismaClient, orgId: string) {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, registry_lifecycle,
      status, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType",
      'ACTIVE'::"VehicleRegistryLifecycle",
      'AVAILABLE'::"VehicleStatus",
      NOW(), NOW()
    )
  `;
  return vehicleId;
}

(run ? describe : describe.skip)('VO-5C-P1.1 registry admission (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const offboarding = new VehicleOffboardingService(prisma as any);
  const tripEngine = new TripDecisionEngine(prisma as any);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('OFFBOARDED vehicle cannot start a new canonical trip', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    try {
      await tripEngine.createTrip({
        vehicleId,
        organizationId: orgId,
        startTime: new Date(),
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE,
      });
    }
  });

  it('OFFBOARDED vehicle fails operational admission assertion', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    await expect(
      assertVehicleRegistryActiveForOperationalAdmission(prisma, orgId, vehicleId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trip wins race: ongoing trip blocks HTTP offboard before lifecycle mutation', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await prisma.vehicleTrip.create({
      data: {
        id: randomUUID(),
        vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: new Date(),
      },
    });
    const preflight = new VehicleOffboardPreflightService(prisma as any);
    const httpOffboard = new VehicleOnboardingOffboardService(
      preflight,
      offboarding,
    );
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);
    const rows = await prisma.$queryRaw<Array<{ registry_lifecycle: string }>>`
      SELECT registry_lifecycle::text AS registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.registry_lifecycle).toBe('ACTIVE');
  });
});

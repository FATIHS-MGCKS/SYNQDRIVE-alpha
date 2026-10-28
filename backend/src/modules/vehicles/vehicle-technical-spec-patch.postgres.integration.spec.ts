/**
 * Vehicle technical specification PATCH → PostgreSQL → read-back.
 *   VEHICLE_TECH_SPEC_PATCH_PG=1 DATABASE_URL=postgresql://.../synqdrive_tech_spec_test npm test -- vehicle-technical-spec-patch.postgres.integration.spec.ts
 */
import { BadRequestException } from '@nestjs/common';
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { VehiclesService } from './vehicles.service';
import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';

const LIVE = process.env.VEHICLE_TECH_SPEC_PATCH_PG === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('VEHICLE_TECH_SPEC_PATCH_PG=1 requires DATABASE_URL');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|tech_spec/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function serviceUpdate(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  body: Record<string, unknown>,
) {
  const serviceCtx = {
    prisma,
    withOrgScope: (orgId: string) => ({ organizationId: orgId }),
  } as unknown as VehiclesService;
  return VehiclesService.prototype.update.call(
    serviceCtx,
    vehicleId,
    {},
    organizationId,
    { rawBody: body },
  );
}

(LIVE ? describe : describe.skip)(
  'Vehicle technical specification PATCH (postgres)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    let organizationId: string;
    let vehicleId: string;

    beforeAll(async () => {
      assertDisposableDatabaseUrl();
      await prisma.$queryRaw`SELECT 1`;
    });

    beforeEach(async () => {
      organizationId = randomUUID();
      vehicleId = randomUUID();
      await prisma.organization.create({
        data: {
          id: organizationId,
          companyName: `TECH-SPEC ${organizationId.slice(0, 8)}`,
          businessType: BusinessType.FLEET,
        },
      });
      await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
      await prisma.vehicle.create({
        data: {
          id: vehicleId,
          organizationId,
          vin: `TS${randomUUID().replace(/-/g, '').slice(0, 14)}`,
          make: 'VW',
          model: 'Golf',
          year: 2020,
          fuelType: FuelType.GASOLINE,
          status: VehicleStatus.AVAILABLE,
          healthStatus: HealthStatus.GOOD,
          tankCapacityLiters: 50,
          serviceIntervalManufacturerKm: 15000,
          driveType: DriveType.FWD,
          idleRpm: 800,
          maxRpm: 6500,
        },
      });
    });

    afterEach(async () => {
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('PATCH/GET round-trip for tank, intervals, drivetrain with confirmation', async () => {
      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        serviceIntervalManufacturerKm: 30000,
        oilChangeIntervalMonths: 24,
        drivetrain: 'AWD',
        technicalSpecificationSave: {
          confirmedFieldKeys: [
            'tankCapacityLiters',
            'serviceIntervalManufacturerKm',
            'oilChangeIntervalMonths',
            'drivetrain',
          ],
        },
      });

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          tankCapacityLiters: true,
          serviceIntervalManufacturerKm: true,
          serviceIntervalManufacturerMonths: true,
          oilChangeIntervalKm: true,
          oilChangeIntervalMonths: true,
          driveType: true,
        },
      });
      expect(row?.tankCapacityLiters).toBe(55);
      expect(row?.serviceIntervalManufacturerKm).toBe(30000);
      expect(row?.oilChangeIntervalMonths).toBe(24);
      expect(row?.serviceIntervalManufacturerMonths).toBeNull();
      expect(row?.oilChangeIntervalKm).toBeNull();
      expect(row?.driveType).toBe(DriveType.AWD);
    });

    it('no-op re-save does not clear omitted fields', async () => {
      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
      });

      await serviceUpdate(prisma, organizationId, vehicleId, {
        curbWeightKg: 1400,
      });

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true, curbWeightKg: true },
      });
      expect(row?.tankCapacityLiters).toBe(55);
      expect(row?.curbWeightKg).toBe(1400);
    });

    it('rejects unconfirmed AI-sourced tank change', async () => {
      await expect(
        serviceUpdate(prisma, organizationId, vehicleId, {
          tankCapacityLiters: 60,
          aiFieldProvenance: { tankCapacityLiters: { category: 'AI_ESTIMATED' } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks overwrite of USER_CONFIRMED idleRpm without confirmation', async () => {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          registrationIdentityProvenance: {
            version: 1,
            updatedAt: new Date().toISOString(),
            fields: {
              idleRpm: {
                value: 800,
                provenance: 'USER_CONFIRMED',
                confirmationStatus: 'USER_CONFIRMED',
                confirmedAt: new Date().toISOString(),
                documentExtractionId: null,
              },
            },
          },
        },
      });

      await expect(
        serviceUpdate(prisma, organizationId, vehicleId, {
          idleRpm: 850,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { idleRpm: true, registrationIdentityProvenance: true },
      });
      expect(row?.idleRpm).toBe(800);
      const doc = parseRegistrationIdentityProvenance(row?.registrationIdentityProvenance);
      expect(doc?.fields?.idleRpm?.value).toBe(800);
    });
  },
);

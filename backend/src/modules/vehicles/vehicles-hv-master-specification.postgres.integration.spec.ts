/**
 * HV master specification persistence (disposable PostgreSQL).
 *   VEHICLE_HV_MASTER_SPEC_PG=1 DATABASE_URL=postgresql://.../synqdrive_hv_master_spec_test npm test -- vehicles-hv-master-specification.postgres.integration.spec.ts
 */
import { ConflictException } from '@nestjs/common';
import {
  BusinessType,
  FuelType,
  HealthStatus,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import type { UpsertHvMasterSpecInput } from './vehicle-hv-master-specification.domain';
import { parseVehicleHvMasterSpecification } from './vehicle-hv-master-specification.domain';
import { VehiclesService } from './vehicles.service';

const LIVE = process.env.VEHICLE_HV_MASTER_SPEC_PG === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('VEHICLE_HV_MASTER_SPEC_PG=1 requires DATABASE_URL');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|hv_master/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

/** Calls production upsert with injected Prisma only (no full Nest DI graph). */
async function serviceUpsert(
  prisma: PrismaClient,
  vehicleId: string,
  patch: UpsertHvMasterSpecInput,
) {
  const serviceCtx = { prisma } as unknown as VehiclesService;
  return VehiclesService.prototype.upsertHvMasterSpecificationForAdmin.call(
    serviceCtx,
    vehicleId,
    patch,
  );
}

(LIVE ? describe : describe.skip)(
  'Vehicles HV master specification (postgres)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    let organizationId: string;
    let vehicleId: string;

    beforeAll(async () => {
      assertDisposableDatabaseUrl();
      await prisma.$queryRaw`SELECT 1`;
      const migrationColumn = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'hv_master_specification'
      `;
      expect(migrationColumn.length).toBe(1);
    });

    beforeEach(async () => {
      organizationId = randomUUID();
      vehicleId = randomUUID();
      await prisma.organization.create({
        data: {
          id: organizationId,
          companyName: `HV-SPEC ${organizationId.slice(0, 8)}`,
          businessType: BusinessType.FLEET,
        },
      });
      await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
      await prisma.vehicle.create({
        data: {
          id: vehicleId,
          organizationId,
          vin: `HV${randomUUID().replace(/-/g, '').slice(0, 14)}`,
          make: 'Tesla',
          model: 'Model 3',
          year: 2023,
          fuelType: FuelType.ELECTRIC,
          status: VehicleStatus.AVAILABLE,
          healthStatus: HealthStatus.GOOD,
          hvBatteryCapacityKwh: 57,
        },
      });
    });

    afterEach(async () => {
      await prisma.vehicleBatteryReferenceCapacity.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('GET/PATCH/GET round-trip preserves evidence and catalog fields', async () => {
      const refCountBefore = await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId },
      });

      const saved = await serviceUpsert(prisma, vehicleId, {
        provenance: 'ESTIMATED',
        chemistry: 'LFP',
        grossCapacityKwh: 60,
        nominalVoltageV: 340,
        variantLabel: 'Tesla Model 3 RWD LFP (CATL 6L catalog — not pack-verified)',
        evidenceNote: 'CATL 6L pack not confirmed for this VIN.',
        catalogReferences: [
          'https://ev-database.org/de/pkw/1555/Tesla-Model-3-RWD',
          'https://www.tesla.com/support/vehicle-warranty',
        ],
      });

      expect(saved.provenance).toBe('ESTIMATED');
      expect(saved.chemistry).toBe('LFP');
      expect(saved.fieldChangeClassification).toBe('CATALOG_ESTIMATED_FIELD_UPDATE');

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { hvMasterSpecification: true, hvBatteryCapacityKwh: true },
      });
      const parsed = parseVehicleHvMasterSpecification(row?.hvMasterSpecification);
      expect(parsed?.variantLabel).toContain('not pack-verified');
      expect(parsed?.catalogReferences?.length).toBe(2);
      expect(row?.hvBatteryCapacityKwh).toBe(57);

      const refCountAfter = await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId },
      });
      expect(refCountAfter).toBe(refCountBefore);
    });

    it('partial PATCH keeps CONFIRMED provenance and prior chemistry', async () => {
      await serviceUpsert(prisma, vehicleId, {
        provenance: 'CONFIRMED',
        chemistry: 'LFP',
        grossCapacityKwh: 60,
      });

      const updated = await serviceUpsert(prisma, vehicleId, {
        nominalVoltageV: 340,
      });

      expect(updated.provenance).toBe('CONFIRMED');
      expect(updated.chemistry).toBe('LFP');
      expect(updated.nominalVoltageV).toBe(340);
    });

    it('rejects gross below legacy usable with 409', async () => {
      await expect(
        serviceUpsert(prisma, vehicleId, { grossCapacityKwh: 50 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  },
);

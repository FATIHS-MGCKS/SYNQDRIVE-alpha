/**
 * Master DIMO registration → HV reference materialization (PostgreSQL).
 * Exercises extraData.usable/gross field flow through canonical VO activation.
 */
import {
  BusinessType,
  FuelType,
  PrismaClient,
  ProductSlug,
  ReferenceCapacityVerificationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { MasterDimoCanonicalRegistrationService } from './master-dimo/master-dimo-canonical-registration.service';
import { insertDimoMirrorForPostgresTests } from './testing/dimo-mirror-postgres.fixture';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { BatteryReferenceCapacityType } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

const run =
  process.env.VO_HV_REFERENCE_MASTER_DIMO_PG === '1' ||
  process.env.VO_SIG_P2_MASTER_DIMO_PG === '1' ||
  process.env.VO4_READINESS_PG === '1';

const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };

async function createOrg(
  prisma: PrismaClient,
  products: ProductSlug[],
): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO-HV-REF ${id.slice(0, 8)}`,
      businessType: products.includes(ProductSlug.FLEET) ? BusinessType.FLEET : BusinessType.RENTAL,
    },
  });
  for (const slug of products) {
    await ensureOrganizationProductEntitlement(prisma, id, slug);
  }
  return id;
}

async function insertBevDimoMirror(
  prisma: PrismaClient,
  input: { id: string; externalId: string; vin: string },
): Promise<void> {
  await insertDimoMirrorForPostgresTests(prisma, {
    ...input,
    rawJson: TESLA_RAW,
  });
  await prisma.$executeRaw`
    UPDATE dimo_vehicles
    SET fuel_type = 'ELECTRIC', updated_at = NOW()
    WHERE id::text = ${input.id}
  `;
}

function masterDimoHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const capture = new VehicleOnboardingCaptureService(prisma as never, base.readinessService, {
    record: async () => null,
  } as never);
  const sourceAdoptionAuthority = new VehicleOnboardingSourceAdoptionAuthority();
  const sourceAdoption = new VehicleOnboardingSourceAdoptionService(
    prisma as never,
    base.caseService,
    sourceAdoptionAuthority,
    { record: async () => null } as never,
  );
  const masterRegistration = new MasterDimoCanonicalRegistrationService(
    prisma as never,
    sourceAdoption,
    capture,
    base.readinessService,
    base.activationService,
  );
  return { ...base, masterRegistration };
}

function bevExtra(overrides: Record<string, unknown> = {}) {
  return {
    fuelType: FuelType.ELECTRIC,
    mileageKm: 10_000,
    hardwareType: 'UNKNOWN',
    ...overrides,
  };
}

(run ? describe : describe.skip)(
  'VO HV reference — master DIMO registration (postgres)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    const harness = masterDimoHarness(prisma);

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function registerBev(
      orgId: string,
      dimoId: string,
      extraData: Record<string, unknown>,
    ) {
      return harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: dimoId,
        extraData: extraData as never,
        actorUserId: null,
      });
    }

    it('materializes one UNVERIFIED USABLE reference for RENTAL BEV with usable extraData', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.RENTAL]);
      const dimoId = randomUUID();
      await insertBevDimoMirror(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      });

      const { vehicle } = await registerBev(
        orgId,
        dimoId,
        bevExtra({ hvBatteryUsableCapacityKwh: 55.2, hvBatteryGrossCapacityKwh: 57 }),
      );

      const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
        where: { vehicleId: vehicle.id, status: 'COMPLETED' },
      });
      const technical = caseRow.draftTechnicalBaselineJson as {
        hvBatteryReference?: { capacityKwh?: number; capacityType?: string };
      };
      expect(technical.hvBatteryReference?.capacityKwh).toBe(55.2);
      expect(technical.hvBatteryReference?.capacityType).toBe(BatteryReferenceCapacityType.USABLE);

      const rows = await prisma.vehicleBatteryReferenceCapacity.findMany({
        where: { organizationId: orgId, vehicleId: vehicle.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.capacityType).toBe(BatteryReferenceCapacityType.USABLE);
      expect(rows[0]!.capacityKwh).toBe(55.2);
      expect(rows[0]!.verificationStatus).toBe(ReferenceCapacityVerificationStatus.UNVERIFIED);
    });

    it('materializes one UNVERIFIED USABLE reference for FLEET BEV (policy aligned with rental)', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.FLEET]);
      const dimoId = randomUUID();
      await insertBevDimoMirror(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      });

      const { vehicle } = await registerBev(orgId, dimoId, bevExtra({ hvBatteryUsableCapacityKwh: 77 }));

      const count = await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId: vehicle.id },
      });
      expect(count).toBe(1);
    });

    it('does not treat gross-only extraData as USABLE reference', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.RENTAL]);
      const dimoId = randomUUID();
      await insertBevDimoMirror(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      });

      await expect(
        registerBev(orgId, dimoId, bevExtra({ hvBatteryGrossCapacityKwh: 60 })),
      ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });

      expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
    });

    it('blocks new BEV activation without usable capacity (RENTAL and FLEET)', async () => {
      for (const product of [ProductSlug.RENTAL, ProductSlug.FLEET] as const) {
        const orgId = await createOrg(prisma, [product]);
        const dimoId = randomUUID();
        await insertBevDimoMirror(prisma, {
          id: dimoId,
          externalId: `ext-${dimoId.slice(0, 8)}`,
          vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        });

        await expect(registerBev(orgId, dimoId, bevExtra())).rejects.toBeInstanceOf(
          VehicleOnboardingError,
        );
        expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
      }
    });

    it('ICE gasoline DIMO registration remains without HV reference row', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.FLEET]);
      const dimoId = randomUUID();
      await insertDimoMirrorForPostgresTests(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        rawJson: TESLA_RAW,
      });

      const { vehicle } = await harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: dimoId,
        extraData: { mileageKm: 5000, hardwareType: 'UNKNOWN' },
        actorUserId: null,
      });

      const count = await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId: vehicle.id },
      });
      expect(count).toBe(0);
    });

    it('idempotent master registration replay does not duplicate reference rows', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.RENTAL]);
      const dimoId = randomUUID();
      await insertBevDimoMirror(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      });

      const first = await registerBev(orgId, dimoId, bevExtra({ hvBatteryUsableCapacityKwh: 60 }));
      const second = await registerBev(orgId, dimoId, bevExtra({ hvBatteryUsableCapacityKwh: 60 }));
      expect(second.idempotentReplay).toBe(true);

      const rows = await prisma.vehicleBatteryReferenceCapacity.findMany({
        where: { vehicleId: first.vehicle.id },
      });
      expect(rows).toHaveLength(1);
    });

    it('prefers explicit usable kWh over legacy hvBatteryCapacityKwh in draft and row', async () => {
      const orgId = await createOrg(prisma, [ProductSlug.RENTAL]);
      const dimoId = randomUUID();
      await insertBevDimoMirror(prisma, {
        id: dimoId,
        externalId: `ext-${dimoId.slice(0, 8)}`,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      });

      const { vehicle } = await registerBev(
        orgId,
        dimoId,
        bevExtra({
          hvBatteryUsableCapacityKwh: 55.2,
          hvBatteryCapacityKwh: 57,
        }),
      );

      const row = await prisma.vehicleBatteryReferenceCapacity.findFirstOrThrow({
        where: { vehicleId: vehicle.id, isActive: true },
      });
      expect(row.capacityKwh).toBe(55.2);
      expect(row.capacityKwh).not.toBe(57);
    });
  },
);

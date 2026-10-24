/**
 * Master DIMO registration → motion physics reference materialization (PostgreSQL).
 */
import { BusinessType, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MotionPhysicsEvidenceTier } from '@prisma/client';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { MasterDimoCanonicalRegistrationService } from './master-dimo/master-dimo-canonical-registration.service';
import { insertDimoMirrorForPostgresTests } from './testing/dimo-mirror-postgres.fixture';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run =
  process.env.VO_MOTION_PHYSICS_MASTER_DIMO_PG === '1' ||
  process.env.VO_SIG_P2_MASTER_DIMO_PG === '1' ||
  process.env.VO4_READINESS_PG === '1';

const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO-MOTION ${id.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.FLEET);
  return id;
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
  return { masterRegistration };
}

(run ? describe : describe.skip)(
  'VO motion physics — master DIMO registration (postgres)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    const harness = masterDimoHarness(prisma);

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('captures motionPhysicsReference draft and materializes active reference on activation', async () => {
      const orgId = await createOrg(prisma);
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
        extraData: {
          mileageKm: 12_000,
          hardwareType: 'UNKNOWN',
          curbWeightKg: 2050,
          systemMotorPowerKw: 210,
          accel0To100S: 5.1,
          motionPhysicsVariantAssumption: 'Long Range AWD',
        },
        actorUserId: null,
      });

      const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
        where: { vehicleId: vehicle.id, status: 'COMPLETED' },
      });
      const technical = caseRow.draftTechnicalBaselineJson as {
        motionPhysicsReference?: {
          systemMotorPowerKw?: number;
          evidenceTier?: string;
        };
      };
      expect(technical.motionPhysicsReference?.systemMotorPowerKw).toBe(210);

      const rows = await prisma.vehicleMotionPhysicsReference.findMany({
        where: { organizationId: orgId, vehicleId: vehicle.id, isActive: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.systemMotorPowerKw).toBe(210);
      expect(rows[0]!.evidenceTier).toBe(MotionPhysicsEvidenceTier.ESTIMATED);

      const audit = await prisma.vehicleMotionPhysicsReferenceChange.count({
        where: { vehicleId: vehicle.id, action: 'CREATED' },
      });
      expect(audit).toBeGreaterThanOrEqual(1);
    });
  },
);

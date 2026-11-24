/**
 * V2B-PR7 — legacy HM registration + shadow observation integration.
 * Gate: `V2B_HM_CANONICAL_READINESS_OBSERVATION_PG=1`
 */
import {
  BusinessType,
  OrganizationStatus,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HighMobilityRegistrationService } from '@modules/high-mobility/high-mobility-registration.service';
import { HmOnlyCanonicalReadinessObservationService } from './hm-only-canonical/hm-only-canonical-readiness-observation.service';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run = process.env.V2B_HM_CANONICAL_READINESS_OBSERVATION_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `PR7-shadow ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
      status: OrganizationStatus.ACTIVE,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createApprovedHmMirror(prisma: PrismaClient, orgId: string) {
  const hmId = randomUUID();
  const vin = `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId: orgId,
      vin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: 'HM_ONLY',
      clearanceStatus: 'APPROVED',
      hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      registrationState: 'NOT_REGISTERED',
    },
  });
  return { hmId, vin };
}

function configService(shadowCompareEnabled: boolean): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'vehicleRegistrationConvergence') {
        return {
          hmOnlyCanonicalEnabled: false,
          billingSingleRailEnabled: false,
          shadowCompareEnabled,
        };
      }
      return undefined;
    }),
  } as unknown as ConfigService;
}

(run ? describe : describe.skip)('V2B-PR7 legacy registration shadow integration (postgres)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PR7-SHADOW-01 shadow ON — legacy registration completes', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const observation = new HmOnlyCanonicalReadinessObservationService(prisma as never);
    const registration = new HighMobilityRegistrationService(
      prisma as never,
      configService(true),
      { registerHmOnlyCanonical: jest.fn() } as never,
      observation,
    );

    const vehiclesBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    const result = await registration.registerHmOnlyVehicle(
      {
        hmVehicleId: hmId,
        organizationId: orgId,
        model: 'X5',
        year: 2022,
        fuelType: 'GASOLINE',
        vehicleType: 'SEDAN',
      },
      { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    );

    expect(result.synqdriveVehicleId).toBeTruthy();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehiclesBefore + 1);
    const linked = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(linked.registrationState).toBe('REGISTERED');
    expect(linked.vin).toBe(vin);
    await new Promise((r) => setTimeout(r, 300));
  });

  it('PR7-SHADOW-02 shadow OFF — registration without observation wiring', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const registration = new HighMobilityRegistrationService(
      prisma as never,
      configService(false),
      { registerHmOnlyCanonical: jest.fn() } as never,
      undefined,
    );

    const result = await registration.registerHmOnlyVehicle(
      {
        hmVehicleId: hmId,
        organizationId: orgId,
        model: 'X5',
        year: 2022,
        fuelType: 'GASOLINE',
        vehicleType: 'SEDAN',
      },
      { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    );
    expect(result.synqdriveVehicleId).toBeTruthy();
  });

  it('PR7-SHADOW-03 duplicate VIN blocks legacy before vehicle create', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin,
        make: 'BMW',
        model: 'Existing',
        year: 2019,
        vehicleName: 'Existing',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    const observation = new HmOnlyCanonicalReadinessObservationService(prisma as never);
    const registration = new HighMobilityRegistrationService(
      prisma as never,
      configService(true),
      { registerHmOnlyCanonical: jest.fn() } as never,
      observation,
    );
    const before = await prisma.vehicle.count({ where: { organizationId: orgId } });
    await expect(
      registration.registerHmOnlyVehicle(
        {
          hmVehicleId: hmId,
          organizationId: orgId,
          model: 'X5',
          year: 2022,
          fuelType: 'GASOLINE',
          vehicleType: 'SEDAN',
        },
        { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      ),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(before);
  });
});
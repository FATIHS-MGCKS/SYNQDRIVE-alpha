/**
 * VO-4.9 Master Admin provider source adoption (PostgreSQL).
 */
import { BusinessType, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { dimoOnboardingActor, sealCaseReadyForTest } from './testing/vehicle-onboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
const run = process.env.VO49_SOURCE_ADOPTION_PG === '1' || process.env.VO4_READINESS_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO49 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createDimoMirror(prisma: PrismaClient, dimoId: string, externalId: string, vin: string | null = null) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${externalId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function createHm(
  prisma: PrismaClient,
  hmId: string,
  organizationId: string | null,
  vin: string,
  clearanceStatus: 'APPROVED' | 'DRAFT' | 'CLEARANCE_PENDING' | 'REJECTED' | 'REVOKED' | 'CANCELED' = 'APPROVED',
  isActive = true,
) {
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId,
      vin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: 'HM_ONLY',
      clearanceStatus,
      isActive,
    },
  });
}

function adoptionHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const adoption = new VehicleOnboardingSourceAdoptionService(
    prisma as any,
    base.caseService,
    new VehicleOnboardingSourceAdoptionAuthority(),
    { record: async () => null } as any,
  );
  return { ...base, adoption };
}

(run ? describe : describe.skip)('VO-4.9 source adoption (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DIMO cross-org concurrent claim: one winner', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const vehiclesBefore = await prisma.vehicle.count();
    const results = await Promise.allSettled([
      adoption.adoptProviderSource({
        organizationId: orgA,
        actorUserId: 'ma-1',
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
      adoption.adoptProviderSource({
        organizationId: orgB,
        actorUserId: 'ma-1',
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'SOURCE_ALREADY_CLAIMED' });
    expect(
      await prisma.vehicleOnboardingCaseSourceRef.count({
        where: { sourceMirrorId: dimoId, provider: 'DIMO' },
      }),
    ).toBe(1);
    expect(await prisma.vehicle.count()).toBe(vehiclesBefore);
  });

  it('HM global cross-org concurrent claim', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, null, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
    const results = await Promise.allSettled([
      adoption.adoptProviderSource({
        organizationId: orgA,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
      adoption.adoptProviderSource({
        organizationId: orgB,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ code: 'SOURCE_ALREADY_CLAIMED' });
  });

  it('HM org-scoped source blocked for wrong org adopt', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, orgA, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgB,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('canonical DIMO suppression on Vehicle.dimoVehicleId', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, dimo_vehicle_id, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", ${dimoId}, NOW(), NOW())
    `;
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('attach composite DIMO+HM rotates token without Vehicle', async () => {
    const { adoption, caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    const token = caseRow.concurrencyToken;
    const vehiclesBefore = await prisma.vehicle.count();
    const projected = await adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: 'ma',
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: token,
    });
    expect(projected.concurrencyToken).not.toBe(token);
    expect(projected.sourceMode).toBe('COMPOSITE');
    expect(await prisma.vehicle.count()).toBe(vehiclesBefore);
  });

  it('READY case attach invalidates readiness and rotates token', async () => {
    const { adoption, caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const ready = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(ready.status).toBe('READY_FOR_ACTIVATION');
    const projected = await adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: ready.concurrencyToken,
    });
    expect(projected.status).toBe('IN_PROGRESS');
    expect(projected.readiness.sealed).toBe(false);
    const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(after.concurrencyToken).toBe(projected.concurrencyToken);
    expect(after.concurrencyToken).not.toBe(ready.concurrencyToken);
  });

  it('semantic attach noop preserves token and readiness', async () => {
    const { adoption, caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const ready = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    const projected = await adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: ready.concurrencyToken,
    });
    expect(projected.concurrencyToken).toBe(ready.concurrencyToken);
    expect(projected.status).toBe('READY_FOR_ACTIVATION');
  });

  it('second DIMO attach blocked before write', async () => {
    const { adoption, caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoA = randomUUID();
    const dimoB = randomUUID();
    await createDimoMirror(prisma, dimoA, `ext-a-${dimoA.slice(0, 6)}`);
    await createDimoMirror(prisma, dimoB, `ext-b-${dimoB.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoA);
    await expect(
      adoption.attachProviderSource({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoB,
        expectedConcurrencyToken: caseRow.concurrencyToken,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_SET_REQUIRES_REVIEW' });
  });

  it('VIN contradiction blocked at attach', async () => {
    const { adoption, caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, 'VINAAAAAAAAAAAAAA');
    await createHm(prisma, hmId, orgId, 'VINBBBBBBBBBBBBBB');
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await expect(
      adoption.attachProviderSource({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        expectedConcurrencyToken: caseRow.concurrencyToken,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
  });

  it('DIMO tenant context blocked at case service', async () => {
    const { caseService } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await expect(
      caseService.openOrResumeFromDimo(
        { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
        dimoId,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('adopt idempotency returns same case', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const key = randomUUID();
    const first = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: key,
    });
    const second = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
  });

  it('HM clearance matrix blocks DRAFT', async () => {
    const { adoption } = adoptionHarness(prisma);
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`, 'DRAFT');
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });
});

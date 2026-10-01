/**
 * VO-4.10 provider candidate discovery (PostgreSQL).
 */
import { BusinessType, Prisma, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingProviderCandidateService } from './services/vehicle-onboarding-provider-candidate.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { dimoOnboardingActor } from './testing/vehicle-onboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';

const run = process.env.VO410_PROVIDER_CANDIDATE_PG === '1' || process.env.VO49_SOURCE_ADOPTION_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO410 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createDimo(prisma: PrismaClient, id: string, externalId: string, vin: string | null = null) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${id}, ${externalId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function createHm(prisma: PrismaClient, id: string, orgId: string | null, vin: string, active = true) {
  await prisma.highMobilityVehicle.create({
    data: {
      id,
      organizationId: orgId,
      vin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: 'HM_ONLY',
      clearanceStatus: 'APPROVED',
      isActive: active,
    },
  });
}

function candidateService(prisma: PrismaClient) {
  return new VehicleOnboardingProviderCandidateService(
    prisma as any,
    new VehicleOnboardingSourceAdoptionAuthority(),
  );
}

async function findDimoCandidate(
  prisma: PrismaClient,
  orgId: string,
  dimoId: string,
) {
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
      cursor,
    });
    const hit = list.items.find((c) => c.sourceMirrorId === dimoId);
    if (hit) {
      return hit;
    }
    if (!list.nextCursor) {
      return undefined;
    }
    cursor = list.nextCursor;
  }
  return undefined;
}

(run ? describe : describe.skip)('VO-4.10 provider candidates (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DIMO unused mirror → AVAILABLE', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const beforeCases = await prisma.vehicleOnboardingCase.count();
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === dimoId && c.disposition === 'AVAILABLE')).toBe(
      true,
    );
    expect(await prisma.vehicleOnboardingCase.count()).toBe(beforeCases);
    expect(JSON.stringify(list)).not.toMatch(/rawJson|snapshotMetadata/);
  });

  it('DIMO same-target primary → RESUMABLE', async () => {
    const harness = createVo4ReadinessTestHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
    });
    const hit = list.items.find((c) => c.sourceMirrorId === dimoId);
    expect(hit?.disposition).toBe('RESUMABLE');
    expect(hit?.resumableCaseId).toBe(caseRow.id);
  });

  it('DIMO cross-org claim omitted without foreign tenant metadata', async () => {
    const harness = createVo4ReadinessTestHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgB), dimoId);
    const list = await candidateService(prisma).listProviderCandidates(orgA, {
      provider: 'DIMO',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === dimoId)).toBe(false);
    expect(JSON.stringify(list)).not.toContain(orgB);
  });

  it('DIMO canonical vehicle suppresses candidate', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, dimo_vehicle_id, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", ${dimoId}, NOW(), NOW())
    `;
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === dimoId)).toBe(false);
  });

  it('HM approved target-org → AVAILABLE', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin);
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId)).toBe(true);
  });

  it('HM wrong-org mirror absent', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, orgB, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
    const list = await candidateService(prisma).listProviderCandidates(orgA, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId)).toBe(false);
    expect(JSON.stringify(list)).not.toContain(orgB);
  });

  it('HM inactive absent', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`, false);
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId)).toBe(false);
  });

  it('secondary-only HM not resumable as candidate for adopt primary', async () => {
    const harness = createVo4ReadinessTestHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      (
        await prisma.vehicleOnboardingCase.findFirstOrThrow({
          where: { organizationId: orgId, status: 'OPEN' },
        })
      ).id,
      hmId,
    );
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId)).toBe(false);
  });

  it('DIMO missing VIN may still project as AVAILABLE', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const hit = await findDimoCandidate(prisma, orgId, dimoId);
    expect(hit?.disposition).toBe('AVAILABLE');
    expect(hit?.vin).toBeNull();
  });

  it('DIMO VehicleDataSourceLink suppresses candidate', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    await prisma.vehicleDataSourceLink.create({
      data: {
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoId,
        isActive: false,
      },
    });
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === dimoId)).toBe(false);
  });

  it('DIMO completed onboarding source ref suppresses candidate', async () => {
    const harness = createVo4ReadinessTestHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const row = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    const vehicleId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    await prisma.$executeRawUnsafe(
      `UPDATE vehicle_onboarding_cases SET status = 'COMPLETED'::"OnboardingCaseStatus", vehicle_id = $2, completed_at = NOW() WHERE id = $1`,
      row.id,
      vehicleId,
    );
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'DIMO',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === dimoId)).toBe(false);
  });

  it('HM global/platform-trusted mirror → AVAILABLE for target org', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    await createHm(prisma, hmId, null, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId && c.disposition === 'AVAILABLE')).toBe(
      true,
    );
  });

  it('HM REGISTERED synqdriveVehicleId absent from candidates', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin);
    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${vin}, 'BMW', 'X1', 2022, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { synqdriveVehicleId: vehicleId, registrationState: 'REGISTERED' },
    });
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 50,
    });
    expect(list.items.some((c) => c.sourceMirrorId === hmId)).toBe(false);
  });

  it('deterministic ordering by provider then sourceMirrorId', async () => {
    const orgId = await createOrg(prisma);
    const dimoA = randomUUID();
    const dimoB = randomUUID();
    await createDimo(prisma, dimoA, `ext-a-${dimoA.slice(0, 6)}`);
    await createDimo(prisma, dimoB, `ext-b-${dimoB.slice(0, 6)}`);
    const list = await candidateService(prisma).listProviderCandidates(orgId, {
      limit: 100,
    });
    const keys = list.items.map((c) => `${c.provider}:${c.sourceMirrorId}`);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });
});

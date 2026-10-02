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
import { parseCandidateListQuery } from './policy/candidate-list-query.validation';
import { buildDimoOnboardingSourceSnapshot } from './adapters/dimo-onboarding-source.adapter';
import { DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE } from './adapters/connection-scope.constants';
import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from './contracts/vo-document-versions';

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
    const query = parseCandidateListQuery({ provider: 'DIMO', limit: '50', cursor });
    const list = await candidateService(prisma).listProviderCandidates(orgId, query);
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

async function collectAllCandidates(
  prisma: PrismaClient,
  orgId: string,
  opts: { provider?: 'DIMO' | 'HIGH_MOBILITY'; limit: number },
) {
  const order: string[] = [];
  const counts = new Map<string, number>();
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
    const query = parseCandidateListQuery({
      provider: opts.provider,
      limit: String(opts.limit),
      cursor,
    });
    const list = await candidateService(prisma).listProviderCandidates(orgId, query);
    for (const item of list.items) {
      const key = `${item.provider}:${item.sourceMirrorId}`;
      order.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (!list.nextCursor) {
      return { order, counts, pages: page + 1 };
    }
    cursor = list.nextCursor;
  }
  throw new Error('pagination did not terminate');
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
    const hit = await findDimoCandidate(prisma, orgId, dimoId);
    expect(hit?.disposition).toBe('AVAILABLE');
    expect(await prisma.vehicleOnboardingCase.count()).toBe(beforeCases);
    expect(JSON.stringify(hit)).not.toMatch(/rawJson|snapshotMetadata/);
  });

  it('DIMO same-target primary → RESUMABLE', async () => {
    const harness = createVo4ReadinessTestHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    const hit = await findDimoCandidate(prisma, orgId, dimoId);
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
    const list = await candidateService(prisma).listProviderCandidates(
      orgId,
      parseCandidateListQuery({ limit: '100' }),
    );
    const keys = list.items.map((c) => `${c.provider}:${c.sourceMirrorId}`);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });

  it('VO-4.10.1 combined pagination: DIMO→HM boundary (lexical UUID trap)', async () => {
    const orgId = await createOrg(prisma);
    const dimoHigh = `ffffffff-ffff-4fff-8fff-${randomUUID().slice(24)}`;
    const hmLow = `00000000-0000-4000-8000-${randomUUID().slice(24)}`;
    await createDimo(prisma, dimoHigh, `ext-high-${randomUUID().slice(0, 8)}`);
    await createHm(prisma, hmLow, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
    const { order, counts } = await collectAllCandidates(prisma, orgId, { limit: 1 });
    const dimoKey = `DIMO:${dimoHigh}`;
    const hmKey = `HIGH_MOBILITY:${hmLow}`;
    expect(counts.get(dimoKey)).toBe(1);
    expect(counts.get(hmKey)).toBe(1);
    expect(order.indexOf(dimoKey)).toBeLessThan(order.indexOf(hmKey));
  });

  it('VO-4.10.1 suppression-heavy scan pagination (batch size 50)', async () => {
    const orgId = await createOrg(prisma);
    const visibleA = randomUUID();
    const visibleB = randomUUID();
    for (let i = 0; i < 50; i++) {
      const id = randomUUID();
      await createDimo(prisma, id, `ext-sup-${randomUUID().slice(0, 8)}`);
      const vehicleId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, dimo_vehicle_id, created_at, updated_at)
        VALUES (${vehicleId}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", ${id}, NOW(), NOW())
      `;
    }
    await createDimo(prisma, visibleA, `ext-visible-a-${visibleA.slice(0, 6)}`);
    await createDimo(prisma, visibleB, `ext-visible-b-${visibleB.slice(0, 6)}`);
    const { counts } = await collectAllCandidates(prisma, orgId, {
      provider: 'DIMO',
      limit: 1,
    });
    expect(counts.get(`DIMO:${visibleA}`)).toBe(1);
    expect(counts.get(`DIMO:${visibleB}`)).toBe(1);
    for (const [, n] of counts) {
      expect(n).toBe(1);
    }
  });

  it('VO-4.10.1 provider-filtered DIMO pagination', async () => {
    const orgId = await createOrg(prisma);
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const id of ids) {
      await createDimo(prisma, id, `ext-${id.slice(0, 8)}`);
    }
    const { order, counts } = await collectAllCandidates(prisma, orgId, { provider: 'DIMO', limit: 1 });
    for (const id of ids) {
      expect(counts.get(`DIMO:${id}`)).toBe(1);
    }
    const ours = order.filter((k) => ids.some((id) => k === `DIMO:${id}`));
    expect(ours).toEqual(ids.map((id) => `DIMO:${id}`));
  });

  it('VO-4.10.1 provider-filtered HM pagination', async () => {
    const orgId = await createOrg(prisma);
    const ids = [randomUUID(), randomUUID()].sort();
    for (const id of ids) {
      await createHm(prisma, id, orgId, `HM${id.slice(0, 8)}`);
    }
    const { order, counts } = await collectAllCandidates(prisma, orgId, {
      provider: 'HIGH_MOBILITY',
      limit: 1,
    });
    const ours = order.filter((k) => ids.some((id) => k === `HIGH_MOBILITY:${id}`));
    expect(ours).toEqual(ids.map((id) => `HIGH_MOBILITY:${id}`));
    for (const id of ids) {
      expect(counts.get(`HIGH_MOBILITY:${id}`)).toBe(1);
    }
  });

  it('VO-4.10.1 multi-holder corruption: mirror omitted for all orgs (postgres)', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const snap = buildDimoOnboardingSourceSnapshot({
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: null,
      make: 'Audi',
      model: 'A3',
      year: 2021,
      fuelType: 'GASOLINE',
      updatedAt: new Date(),
    });
    const scopeKey = DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE ?? '';
    for (const [orgId, caseId] of [[orgA, randomUUID()], [orgB, randomUUID()]] as const) {
      await prisma.vehicleOnboardingCase.create({
        data: {
          id: caseId,
          organizationId: orgId,
          sourceMode: 'DIMO',
          status: 'OPEN',
          primarySourceProvider: 'DIMO',
          primarySourceScopeKey: scopeKey,
          primarySourceExternalId: snap.externalVehicleIdentity,
          idempotencyKey: randomUUID(),
          concurrencyToken: randomUUID(),
          sourceRefs: {
            create: {
              id: randomUUID(),
              provider: 'DIMO',
              connectionScope: DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE,
              connectionScopeKey: scopeKey,
              externalVehicleIdentity: snap.externalVehicleIdentity,
              sourceMirrorId: dimoId,
              isPrimary: true,
              snapshotMetadataJson: snap as unknown as Prisma.InputJsonValue,
              snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
            },
          },
        },
      });
    }
    const beforeCases = await prisma.vehicleOnboardingCase.count();
    for (const [queryOrg, foreignOrg] of [[orgA, orgB], [orgB, orgA]] as const) {
      const { order } = await collectAllCandidates(prisma, queryOrg, { limit: 50 });
      expect(order.some((k) => k === `DIMO:${dimoId}`)).toBe(false);
      expect(JSON.stringify(order)).not.toContain(foreignOrg);
    }
    expect(await prisma.vehicleOnboardingCase.count()).toBe(beforeCases);
  });
});

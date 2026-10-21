/**
 * VO-2 / VO-2.1 persistence invariants (PostgreSQL).
 * Run: VO2_PERSISTENCE_PG=1 npx jest vo2-persistence.postgres.integration --runInBand
 */
import { PrismaClient, BusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const run = process.env.VO2_PERSISTENCE_PG === '1';

async function createFixtureOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO2 PG Test ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

/** Minimal vehicle row via SQL (avoids Prisma/schema columns not yet in migration history). */
async function createFixtureDimoVehicle(prisma: PrismaClient, dimoId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${`vo2-test-${dimoId}`}, 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function createFixtureVehicle(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  vin: string | null = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at
    ) VALUES (
      ${vehicleId},
      ${organizationId},
      ${vin},
      'Volkswagen',
      'Golf',
      2020,
      'GASOLINE'::"FuelType",
      NOW(),
      NOW()
    )
  `;
}

(run ? describe : describe.skip)('VO-2 vehicle onboarding persistence', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has registry lifecycle column on vehicles', async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_name = 'vehicles' AND column_name = 'registry_lifecycle'
    `;
    expect(rows[0]?.count).toBe(BigInt(1));
  });

  it('enforces one open org assignment per vehicle', async () => {
    const orgId = await createFixtureOrg(prisma);
    const vehicleId = randomUUID();
    await createFixtureVehicle(prisma, orgId, vehicleId);
    await prisma.vehicleOrganizationAssignment.create({
      data: {
        id: randomUUID(),
        vehicleId,
        organizationId: orgId,
        validFrom: new Date(),
        assignmentSource: 'VO2_TEST',
      },
    });

    await expect(
      prisma.vehicleOrganizationAssignment.create({
        data: {
          id: randomUUID(),
          vehicleId,
          organizationId: orgId,
          validFrom: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects duplicate global idempotency key after case COMPLETED', async () => {
    const orgId = await createFixtureOrg(prisma);
    const key = `idem-${randomUUID()}`;
    const caseId = randomUUID();
    const vehicleId = randomUUID();
    await createFixtureVehicle(prisma, orgId, vehicleId);

    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseId,
        organizationId: orgId,
        sourceMode: 'MANUAL',
        status: 'COMPLETED',
        idempotencyKey: key,
        vehicleId,
        completedAt: new Date(),
      },
    });

    await expect(
      prisma.vehicleOnboardingCase.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          sourceMode: 'MANUAL',
          status: 'OPEN',
          idempotencyKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes open primary source identity by connection scope key', async () => {
    const orgId = await createFixtureOrg(prisma);
    const externalId = `ext-${randomUUID()}`;
    const caseGlobal = randomUUID();
    const caseScoped = randomUUID();

    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseGlobal,
        organizationId: orgId,
        sourceMode: 'DIMO',
        status: 'OPEN',
        primarySourceProvider: 'DIMO',
        primarySourceScopeKey: '',
        primarySourceExternalId: externalId,
      },
    });

    await expect(
      prisma.vehicleOnboardingCase.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          sourceMode: 'DIMO',
          status: 'OPEN',
          primarySourceProvider: 'DIMO',
          primarySourceScopeKey: '',
          primarySourceExternalId: externalId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseScoped,
        organizationId: orgId,
        sourceMode: 'DIMO',
        status: 'OPEN',
        primarySourceProvider: 'DIMO',
        primarySourceScopeKey: 'account-b',
        primarySourceExternalId: externalId,
      },
    });

    await prisma.vehicleOnboardingCase.deleteMany({
      where: { id: { in: [caseGlobal, caseScoped] } },
    });
  });

  it('enforces one is_primary source ref per case', async () => {
    const orgId = await createFixtureOrg(prisma);
    const caseId = randomUUID();
    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseId,
        organizationId: orgId,
        sourceMode: 'DIMO',
        status: 'OPEN',
      },
    });

    await prisma.vehicleOnboardingCaseSourceRef.create({
      data: {
        id: randomUUID(),
        onboardingCaseId: caseId,
        provider: 'DIMO',
        connectionScopeKey: '',
        externalVehicleIdentity: 'token-1',
        isPrimary: true,
      },
    });

    await expect(
      prisma.vehicleOnboardingCaseSourceRef.create({
        data: {
          id: randomUUID(),
          onboardingCaseId: caseId,
          provider: 'DIMO',
          connectionScopeKey: 'acct',
          externalVehicleIdentity: 'token-2',
          isPrimary: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.vehicleOnboardingCase.delete({ where: { id: caseId } });
  });

  it('rejects invalid COMPLETED terminal field combination', async () => {
    const orgId = await createFixtureOrg(prisma);
    await expect(
      prisma.$executeRaw`
        INSERT INTO vehicle_onboarding_cases (
          id, organization_id, source_mode, status, created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${orgId}, 'MANUAL'::"OnboardingCaseSourceMode", 'COMPLETED'::"OnboardingCaseStatus",
          NOW(), NOW()
        )
      `,
    ).rejects.toBeTruthy();
  });

  it('allows multiple inactive data source link episodes per scope', async () => {
    const orgId = await createFixtureOrg(prisma);
    const vehicleId = randomUUID();
    await createFixtureVehicle(prisma, orgId, vehicleId);

    const dimoId = randomUUID();
    await createFixtureDimoVehicle(prisma, dimoId);

    const link1 = randomUUID();
    const link2 = randomUUID();
    const link3 = randomUUID();

    await prisma.vehicleDataSourceLink.create({
      data: {
        id: link1,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        dimoVehicleId: dimoId,
        isActive: true,
        activatedAt: new Date(),
      },
    });

    await prisma.vehicleDataSourceLink.update({
      where: { id: link1 },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    const dimoId2 = randomUUID();
    await createFixtureDimoVehicle(prisma, dimoId2);

    await prisma.vehicleDataSourceLink.create({
      data: {
        id: link2,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        dimoVehicleId: dimoId2,
        isActive: false,
        activatedAt: new Date(),
        deactivatedAt: new Date(),
      },
    });

    const dimoId3 = randomUUID();
    await createFixtureDimoVehicle(prisma, dimoId3);

    await prisma.vehicleDataSourceLink.create({
      data: {
        id: link3,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        dimoVehicleId: dimoId3,
        isActive: true,
        activatedAt: new Date(),
      },
    });

    const dimoId4 = randomUUID();
    await createFixtureDimoVehicle(prisma, dimoId4);

    await expect(
      prisma.vehicleDataSourceLink.create({
        data: {
          id: randomUUID(),
          vehicleId,
          provider: 'DIMO',
          sourceType: 'DIMO',
          sourceSubtype: null,
          dimoVehicleId: dimoId4,
          isActive: true,
          activatedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId } });
    for (const id of [dimoId, dimoId2, dimoId3, dimoId4]) {
      await prisma.$executeRaw`DELETE FROM dimo_vehicles WHERE id = ${id}`;
    }
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
  });

  it('supports onboarding case without vehicleId', async () => {
    const orgId = await createFixtureOrg(prisma);
    const caseId = randomUUID();
    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseId,
        organizationId: orgId,
        sourceMode: 'MANUAL',
        status: 'OPEN',
      },
    });
    const row = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseId } });
    expect(row?.vehicleId).toBeNull();
    await prisma.vehicleOnboardingCase.delete({ where: { id: caseId } });
  });

  it('lifecycle outbox idempotency key is unique', async () => {
    const key = `vo2-test-${randomUUID()}`;
    const id1 = randomUUID();
    await prisma.vehicleRegistryLifecycleOutbox.create({
      data: {
        id: id1,
        eventId: randomUUID(),
        eventType: 'VEHICLE_ACTIVATED',
        payloadVersion: 1,
        payload: { contractVersion: 1 },
        occurredAt: new Date(),
        idempotencyKey: key,
      },
    });
    await expect(
      prisma.vehicleRegistryLifecycleOutbox.create({
        data: {
          id: randomUUID(),
          eventId: randomUUID(),
          eventType: 'VEHICLE_ACTIVATED',
          payloadVersion: 1,
          payload: { contractVersion: 1 },
          occurredAt: new Date(),
          idempotencyKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.vehicleRegistryLifecycleOutbox.delete({ where: { id: id1 } });
  });
});

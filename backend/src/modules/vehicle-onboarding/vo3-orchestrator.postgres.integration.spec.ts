/**
 * VO-3 orchestrator + activation (PostgreSQL).
 * Run: VO3_ORCHESTRATOR_PG=1 npx jest vo3-orchestrator.postgres.integration --runInBand
 */
import {
  PrismaClient,
  BusinessType,
  type VehicleOnboardingCase,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import { TestVehicleOnboardingReadinessAuthority } from './readiness/test-readiness-authority';
const run = process.env.VO3_ORCHESTRATOR_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO3 ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

async function createDimoMirror(prisma: PrismaClient, dimoId: string, externalId: string, vin: string | null) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, connection_status, created_at, updated_at)
    VALUES (
      ${dimoId},
      ${externalId},
      ${vin},
      'Audi',
      'A3',
      2021,
      'CONNECTED'::"DimoConnectionStatus",
      NOW(),
      NOW()
    )
  `;
}

async function sealAndActivate(
  prisma: PrismaClient,
  caseService: VehicleOnboardingCaseService,
  activation: VehicleOnboardingActivationService,
  orgId: string,
  caseRow: VehicleOnboardingCase,
  actor: string | null = null,
) {
  await caseService.attestReadyForActivationTestOnly(orgId, caseRow.id, actor);
  return activation.activateVehicle({
    organizationId: orgId,
    onboardingCaseId: caseRow.id,
    actorUserId: actor,
    activationIdempotencyKey: `act:${caseRow.id}`,
    readinessAuthority: new TestVehicleOnboardingReadinessAuthority(),
  });
}

(run ? describe : describe.skip)('VO-3 vehicle onboarding orchestrator', () => {
  const prisma = new PrismaClient();
  const caseService = new VehicleOnboardingCaseService(prisma as any);
  const activation = new VehicleOnboardingActivationService(
    prisma as any,
    caseService,
    new DimoVehicleDataSourceLinkService(prisma as any),
  );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('open case is idempotent on same idempotency key', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const ctx = {
      organizationId: orgId,
      actorUserId: null,
      idempotencyKey: `idem-${randomUUID()}`,
    };
    const a = await caseService.openOrResumeFromDimo(ctx, dimoId);
    const b = await caseService.openOrResumeFromDimo(ctx, dimoId);
    expect(a.id).toBe(b.id);
  });

  it('activates DIMO case with nullable VIN', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgId,
        actorUserId: 'user-1',
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    const result = await sealAndActivate(prisma, caseService, activation, orgId, caseRow, 'user-1');
    expect(result.created).toBe(true);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: result.vehicleId } });
    expect(vehicle?.vin).toBeNull();
    expect(vehicle?.dimoVehicleId).toBe(dimoId);
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirst({
      where: { vehicleId: result.vehicleId, eventType: 'VEHICLE_ACTIVATED' },
    });
    expect(outbox).toBeTruthy();
  });

  it('activation retry is idempotent', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, 'WVWZZZ1JZXW000099');
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgId,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    await sealAndActivate(prisma, caseService, activation, orgId, caseRow);
    const second = await activation.activateVehicle({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
      activationIdempotencyKey: `act:${caseRow.id}`,
      readinessAuthority: new TestVehicleOnboardingReadinessAuthority(),
    });
    expect(second.created).toBe(false);
    const vehicles = await prisma.vehicle.count({
      where: { organizationId: orgId, vin: 'WVWZZZ1JZXW000099' },
    });
    expect(vehicles).toBe(1);
  });

  it('same-org VIN collision fails closed', async () => {
    const orgId = await createOrg(prisma);
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${randomUUID()}, ${orgId}, ${vin}, 'VW', 'Polo', 2019, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgId,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    await caseService.attestReadyForActivationTestOnly(orgId, caseRow.id, null);
    await expect(
      activation.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        activationIdempotencyKey: `act:${caseRow.id}`,
        readinessAuthority: new TestVehicleOnboardingReadinessAuthority(),
      }),
    ).rejects.toMatchObject({ code: 'VIN_CONFLICT_REQUIRES_IDENTITY_REVIEW' });
  });

  it('wrong organization cannot activate case', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgA,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    await caseService.attestReadyForActivationTestOnly(orgA, caseRow.id, null);
    await expect(
      activation.activateVehicle({
        organizationId: orgB,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        activationIdempotencyKey: `act:${caseRow.id}`,
        readinessAuthority: new TestVehicleOnboardingReadinessAuthority(),
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('manual activation with plate creates plate history', async () => {
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      {
        organizationId: orgId,
        actorUserId: 'u1',
        idempotencyKey: randomUUID(),
      },
      {
        make: 'BMW',
        model: 'X1',
        year: 2022,
        fuelType: 'DIESEL',
        licensePlate: 'M-VO3-99',
      },
    );
    const result = await sealAndActivate(prisma, caseService, activation, orgId, caseRow);
    const plates = await prisma.vehicleLicensePlateAssignment.findMany({
      where: { vehicleId: result.vehicleId, validTo: null },
    });
    expect(plates).toHaveLength(1);
    expect(plates[0]?.plate).toBe('M-VO3-99');
    const orgAssign = await prisma.vehicleOrganizationAssignment.findFirst({
      where: { vehicleId: result.vehicleId, validTo: null },
    });
    expect(orgAssign?.assignmentSource).toBe('VEHICLE_ONBOARDING');
  });

  it('rolls back when fault injected after vehicle create', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgId,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    await caseService.attestReadyForActivationTestOnly(orgId, caseRow.id, null);
    await expect(
      activation.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        activationIdempotencyKey: `act:${caseRow.id}`,
        readinessAuthority: new TestVehicleOnboardingReadinessAuthority(),
        faultAfterStage: 'AFTER_VEHICLE_CREATE',
      }),
    ).rejects.toThrow('VO3_FAULT_INJECTION');

    const refreshed = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseRow.id } });
    expect(refreshed?.status).not.toBe('COMPLETED');
    const orphanCount = await prisma.vehicle.count({ where: { organizationId: orgId } });
    expect(orphanCount).toBe(0);
  });

  it('activates HM_ONLY source without DIMO hardware fields', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
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
    const caseRow = await caseService.openOrResumeFromHighMobility(
      {
        organizationId: orgId,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      hmId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin,
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'UNVERIFIED',
          make: 'BMW',
          model: 'i3',
          year: 2020,
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
      },
    });
    const result = await sealAndActivate(prisma, caseService, activation, orgId, caseRow);
    const hm = await prisma.highMobilityVehicle.findUnique({ where: { id: hmId } });
    expect(hm?.synqdriveVehicleId).toBe(result.vehicleId);
    expect(hm?.registrationState).toBe('REGISTERED');
    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.vehicleId, sourceSubtype: 'HM_ONLY', isActive: true },
    });
    expect(link).toBeTruthy();
  });

  it('concurrent activation converges to one vehicle', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await caseService.openOrResumeFromDimo(
      {
        organizationId: orgId,
        actorUserId: null,
        idempotencyKey: randomUUID(),
      },
      dimoId,
    );
    await caseService.attestReadyForActivationTestOnly(orgId, caseRow.id, null);
    const authority = new TestVehicleOnboardingReadinessAuthority();
    const input = {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
      activationIdempotencyKey: `act:${caseRow.id}`,
      readinessAuthority: authority,
    };
    const results = await Promise.all([
      activation.activateVehicle(input),
      activation.activateVehicle(input),
      activation.activateVehicle(input),
    ]);
    const vehicleIds = new Set(results.map((r) => r.vehicleId));
    expect(vehicleIds.size).toBe(1);
  });
});

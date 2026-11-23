/**
 * PG-03 — V2B HM_ONLY canonical registration (PostgreSQL).
 * Gate: `V2B_HM_ONLY_CANONICAL_PG=1` (disposable CI DB only).
 */
import {
  BusinessType,
  FuelType,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { technicalBaselineV2HvBattery } from './testing/technical-baseline-test.fixtures';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { createHmOnlyCanonicalPgHarness } from './testing/v2b-hm-only-canonical-pg.harness';
import { activateForTest } from './testing/vehicle-onboarding-test.harness';
import type { Vo3ActivationFaultStage } from './services/vehicle-onboarding-activation.service';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';
import { hmOnlyCanonicalRegistrationIdempotencyKey } from './hm-only-canonical/hm-only-canonical-registration.types';
import { VehicleRegistryLifecycleOutboxProcessor } from './registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { VehicleRegistryLifecycleOutboxRepository } from './registry-lifecycle/vehicle-registry-lifecycle-outbox.repository';
import { BillingVehicleRegistryOffboardProjection } from '@modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { BillingQuantityService } from '@modules/billing/billing-quantity.service';
import { BillableVehiclesService } from '@modules/billing/billable-vehicles.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { buildRegistryActivateBillingIdempotencyKey } from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';

const run = process.env.V2B_HM_ONLY_CANONICAL_PG === '1';

async function createOrg(prisma: PrismaClient, withRental = true): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `PG03 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  if (withRental) {
    await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  }
  return id;
}

async function createApprovedHmMirror(
  prisma: PrismaClient,
  orgId: string,
  opts?: { vin?: string; clearanceStatus?: string; sourceMode?: string; registrationState?: string; synqdriveVehicleId?: string | null },
) {
  const hmId = randomUUID();
  const vin = opts?.vin ?? `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId: orgId,
      vin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: (opts?.sourceMode ?? 'HM_ONLY') as 'HM_ONLY',
      clearanceStatus: (opts?.clearanceStatus ?? 'APPROVED') as 'APPROVED',
      hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      registrationState: (opts?.registrationState ?? 'NOT_REGISTERED') as 'NOT_REGISTERED',
      synqdriveVehicleId: opts?.synqdriveVehicleId ?? null,
    },
  });
  return { hmId, vin };
}

function tenantAccess(orgId: string, actorUserId: string | null = `actor-${orgId.slice(0, 8)}`) {
  return { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId };
}

function registryBillingProcessor(prisma: PrismaClient) {
  const projection = new BillingVehicleRegistryOffboardProjection(
    prisma as never,
    new BillableVehiclesService(prisma as never),
    new BillingQuantityService(prisma as never),
  );
  const billingQuantity = new BillingQuantityVehicleIntegration(
    new BillingQuantityService(prisma as never),
    new BillableVehiclesService(prisma as never),
    projection,
  );
  return new VehicleRegistryLifecycleOutboxProcessor(
    prisma as never,
    new VehicleRegistryLifecycleOutboxRepository(prisma as never),
    projection,
    billingQuantity,
  );
}

(run ? describe : describe.skip)('PG-03 V2B HM_ONLY canonical convergence (postgres)', () => {
  jest.setTimeout(180_000);
  const prisma = new PrismaClient();
  const prismaB = new PrismaClient();
  const harness = createHmOnlyCanonicalPgHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaB.$disconnect();
  });

  it('PG-03-A happy path: canonical register → vehicle, HM mirror, case, single outbox', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const result = await harness.hmOnlyCanonical.register({
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'ELECTRIC', vehicleType: 'SEDAN' },
      access: tenantAccess(orgId),
    });
    expect(result.synqdriveVehicleId).toBeTruthy();
    expect(result.hmVehicleId).toBe(hmId);
    expect(result.vin).toBe(vin);

    const vehicles = await prisma.vehicle.findMany({ where: { organizationId: orgId } });
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]!.id).toBe(result.synqdriveVehicleId);
    expect(vehicles[0]!.vin).toBe(vin);
    expect(vehicles[0]!.registryLifecycle).toBe(VehicleRegistryLifecycle.ACTIVE);

    const hm = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(hm.synqdriveVehicleId).toBe(result.synqdriveVehicleId);
    expect(hm.registrationState).toBe('REGISTERED');

    const caseRow = await prisma.vehicleOnboardingCase.findFirst({
      where: { organizationId: orgId, vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });
    expect(caseRow).toBeTruthy();

    const sourceRef = await prisma.vehicleOnboardingCaseSourceRef.findFirst({
      where: { onboardingCaseId: caseRow!.id, provider: 'HIGH_MOBILITY' },
    });
    expect(sourceRef?.sourceMirrorId).toBe(hmId);

    const hmLink = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.synqdriveVehicleId, sourceType: 'HIGH_MOBILITY', isActive: true },
    });
    expect(hmLink).toBeTruthy();

    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findMany({
      where: { organizationId: orgId, idempotencyKey: activationOutboxIdempotencyKey(caseRow!.id) },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.eventType).toBe('VEHICLE_ACTIVATED');
  });

  it('PG-03-B idempotency: repeated register returns same vehicle without duplicate artifacts', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const input = {
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'GASOLINE' },
      access: tenantAccess(orgId),
    };
    const first = await harness.hmOnlyCanonical.register(input);
    const second = await harness.hmOnlyCanonical.register(input);
    expect(second.synqdriveVehicleId).toBe(first.synqdriveVehicleId);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    const cases = await prisma.vehicleOnboardingCase.findMany({
      where: { organizationId: orgId, status: 'COMPLETED' },
    });
    expect(cases.length).toBeGreaterThanOrEqual(1);
    const outboxCount = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
    });
    expect(outboxCount).toBe(1);
  });

  it('PG-03-C concurrent register serializes to one vehicle (dual Prisma clients)', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const harnessB = createHmOnlyCanonicalPgHarness(prismaB);
    const payload = {
      dto: { hmVehicleId: hmId, organizationId: orgId },
      access: tenantAccess(orgId),
    };
    const [r1, r2] = await Promise.allSettled([
      harness.hmOnlyCanonical.register(payload),
      harnessB.hmOnlyCanonical.register(payload),
    ]);
    const successes = [r1, r2].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof harness.hmOnlyCanonical.register>>
    >[];
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const vehicleId = successes[0]!.value.synqdriveVehicleId;
    for (const s of successes) {
      expect(s.value.synqdriveVehicleId).toBe(vehicleId);
    }
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('PG-03-D billing outbox idempotency: processor retry does not double quantity', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await harness.hmOnlyCanonical.register({
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'GASOLINE' },
      access: tenantAccess(orgId),
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
    });
    const processor = registryBillingProcessor(prisma);
    await processor.processRow(outbox.id);
    await processor.processRow(outbox.id);
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.id);
    const events = await prisma.billingQuantityEvent.count({
      where: { organizationId: orgId, idempotencyKey: billingKey },
    });
    expect(events).toBeLessThanOrEqual(1);
  });

  it('PG-03-E rejects cross-tenant HM adoption', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgA);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgB },
        access: tenantAccess(orgB),
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('PG-03-F rejects unapproved clearance', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId, { clearanceStatus: 'CLEARANCE_PENDING' });
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgId },
        access: tenantAccess(orgId),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-G rejects missing HM mirror', async () => {
    const orgId = await createOrg(prisma);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: randomUUID(), organizationId: orgId },
        access: tenantAccess(orgId),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PG-03-H rejects duplicate VIN in tenant', async () => {
    const orgId = await createOrg(prisma);
    const { vin } = await createApprovedHmMirror(prisma, orgId);
    await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin,
        make: 'BMW',
        model: 'X5',
        year: 2022,
        fuelType: FuelType.GASOLINE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    const { hmId: hm2 } = await createApprovedHmMirror(prisma, orgId, { vin });
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hm2, organizationId: orgId },
        access: tenantAccess(orgId),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PG-03-I rejects hvBatteryReferenceServiceEventId on ingress', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: {
          hmVehicleId: hmId,
          organizationId: orgId,
          hvBatteryUsableCapacityKwh: 75,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
          hvBatteryReferenceServiceEventId: 'evt-forbidden',
        },
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
  });

  it('PG-03-J rejects high-trust battery without substantiating document', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: {
          hmVehicleId: hmId,
          organizationId: orgId,
          hvBatteryUsableCapacityKwh: 75,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
        },
        access: tenantAccess(orgId),
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-K rejects OFFBOARDED lifecycle for same VIN', async () => {
    const orgId = await createOrg(prisma);
    const vin = `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin,
        make: 'BMW',
        model: 'i3',
        year: 2020,
        fuelType: FuelType.ELECTRIC,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    const { hmId } = await createApprovedHmMirror(prisma, orgId, { vin });
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgId },
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('PG-03-L rejects missing product entitlement', async () => {
    const orgId = await createOrg(prisma, false);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'ELECTRIC' },
        access: tenantAccess(orgId),
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-M registered HM mirror returns idempotent success without second outbox', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const first = await harness.hmOnlyCanonical.register({
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'ELECTRIC' },
      access: tenantAccess(orgId),
    });
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
    });
    const second = await harness.hmOnlyCanonical.register({
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'ELECTRIC' },
      access: tenantAccess(orgId),
    });
    expect(second.synqdriveVehicleId).toBe(first.synqdriveVehicleId);
    const hm = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(hm.vin).toBe(vin);
    const outboxAfter = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
    });
    expect(outboxAfter).toBe(outboxBefore);
    expect(outboxAfter).toBe(1);
  });

  it('PG-03-N activation fault AFTER_MIRROR_UPDATE rolls back (canonical readiness path)', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(orgId, hmId);
    const adopted = await harness.sourceAdoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: tenantAccess(orgId).actorUserId,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      idempotencyKey,
    });
    let token = adopted.concurrencyToken ?? '';
    const admin = await harness.capture.updateAdminBaseline({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      body: { vehicleName: `HM ${vin.slice(-6)}`, licensePlate: null, stationId: null, notes: 'pg03 fault' },
      expectedConcurrencyToken: token,
    });
    token = admin.case.concurrencyToken ?? '';
    await prisma.vehicleOnboardingCase.update({
      where: { id: adopted.id },
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
    const technical = await harness.capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      body: { ...technicalBaselineV2HvBattery(), version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 },
      expectedConcurrencyToken: token,
    });
    token = technical.case.concurrencyToken ?? '';
    const readiness = await harness.readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: adopted.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: tenantAccess(orgId).actorUserId,
    });
    expect(readiness.decision).toBe('READY');
    const vehicleBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    const stage: Vo3ActivationFaultStage = 'AFTER_MIRROR_UPDATE';
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: adopted.id,
        actorUserId: tenantAccess(orgId).actorUserId,
        faultAfterStage: stage,
      }),
    ).rejects.toThrow('VO3_FAULT_INJECTION');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehicleBefore);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } }),
    ).toBe(0);
    await harness.hmOnlyCanonical.register({
      dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'ELECTRIC' },
      access: tenantAccess(orgId),
    });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
  });
});
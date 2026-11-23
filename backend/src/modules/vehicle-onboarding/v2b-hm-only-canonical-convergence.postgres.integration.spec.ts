/**
 * PG-03 — V2B HM_ONLY canonical registration (PostgreSQL).
 * Gate: `V2B_HM_ONLY_CANONICAL_PG=1` (disposable CI DB only).
 */
import {
  BillingQuantityEventType,
  BusinessType,
  DocumentExtractionStatus,
  DocumentExtractionType,
  FuelType,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  technicalBaselineV2Empty,
  technicalBaselineV2HvBattery,
} from './testing/technical-baseline-test.fixtures';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from './contracts/vo-document-versions';
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
import { readConnectionIdentityFromLinkMetadata } from './connection-identity/source-link-connection-identity.metadata';
import { buildHmOnlyAdminBaselineDraft } from './hm-only-canonical/hm-only-canonical-registration.mapper';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';

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
  opts?: {
    vin?: string;
    clearanceStatus?: string;
    sourceMode?: string;
    registrationState?: string;
    synqdriveVehicleId?: string | null;
    packageType?: 'HEALTH' | 'FULL_TELEMETRY';
  },
) {
  const hmId = randomUUID();
  const vin = opts?.vin ?? `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId: orgId,
      vin,
      brand: 'BMW',
      packageType: (opts?.packageType ?? 'HEALTH') as 'HEALTH',
      sourceMode: (opts?.sourceMode ?? 'HM_ONLY') as 'HM_ONLY',
      clearanceStatus: (opts?.clearanceStatus ?? 'APPROVED') as 'APPROVED',
      hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      registrationState: (opts?.registrationState ?? 'NOT_REGISTERED') as 'NOT_REGISTERED',
      synqdriveVehicleId: opts?.synqdriveVehicleId ?? null,
    },
  });
  return { hmId, vin };
}

function tenantAccess(orgId: string) {
  return { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
}

function iceHmDto(
  hmId: string,
  orgId: string,
  overrides?: Partial<RegisterHmOnlyVehicleDto>,
): RegisterHmOnlyVehicleDto {
  return {
    hmVehicleId: hmId,
    organizationId: orgId,
    model: 'X5',
    year: 2022,
    fuelType: 'GASOLINE',
    vehicleType: 'SEDAN',
    ...overrides,
  };
}

async function createOnboardingBatteryDocument(
  prisma: PrismaClient,
  orgId: string,
  capacityKwh: number,
) {
  const docId = randomUUID();
  await prisma.vehicleDocumentExtraction.create({
    data: {
      id: docId,
      organizationId: orgId,
      vehicleId: null,
      status: DocumentExtractionStatus.CONFIRMED,
      effectiveDocumentType: DocumentExtractionType.REGISTRATION_CERTIFICATE,
      contentSha256: `sha-${docId.slice(0, 8)}`,
      confirmedData: { scope: 'hv', capacityKwh },
    },
  });
  return docId;
}

async function ensureBasePlan(prisma: PrismaClient, orgId: string, quantity = 0) {
  const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({ where: { key: 'FLEET' } });
  const subId = randomUUID();
  await prisma.billingSubscription.create({
    data: {
      id: subId,
      organizationId: orgId,
      status: 'ACTIVE',
      currency: 'EUR',
    },
  });
  const item = await prisma.billingSubscriptionItem.create({
    data: {
      subscriptionId: subId,
      organizationId: orgId,
      billingProductId: fleet.id,
      itemRole: 'BASE_PLAN',
      quantity,
      status: 'ACTIVE',
      validFrom: new Date('2020-01-01'),
    },
  });
  const fixtureCreatedAt = new Date('2020-01-01T00:00:00.000Z');
  await prisma.$executeRaw`
    UPDATE billing_subscriptions SET created_at = ${fixtureCreatedAt} WHERE id = ${subId}
  `;
  await prisma.$executeRaw`
    UPDATE billing_subscription_items SET created_at = ${fixtureCreatedAt} WHERE id = ${item.id}
  `;
  return item;
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

  it('PG-03-A happy path: ICE register → vehicle, HM mirror, case, connection identity, single outbox', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const result = await harness.hmOnlyCanonical.register({
      dto: iceHmDto(hmId, orgId),
      access: tenantAccess(orgId),
    });
    expect(result.synqdriveVehicleId).toBeTruthy();
    expect(result.hmVehicleId).toBe(hmId);
    expect(result.vin).toBe(vin);

    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: result.synqdriveVehicleId } });
    expect(vehicle.organizationId).toBe(orgId);
    expect(vehicle.vin).toBe(vin);
    expect(vehicle.model).toBe('X5');
    expect(vehicle.year).toBe(2022);
    expect(vehicle.registryLifecycle).toBe(VehicleRegistryLifecycle.ACTIVE);

    const hm = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(hm.synqdriveVehicleId).toBe(result.synqdriveVehicleId);
    expect(hm.registrationState).toBe('REGISTERED');

    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { organizationId: orgId, vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });

    const cases = await prisma.vehicleOnboardingCase.findMany({
      where: { organizationId: orgId, idempotencyKey: hmOnlyCanonicalRegistrationIdempotencyKey(orgId, hmId) },
    });
    expect(cases).toHaveLength(1);

    const sourceRef = await prisma.vehicleOnboardingCaseSourceRef.findFirstOrThrow({
      where: { onboardingCaseId: caseRow.id, provider: 'HIGH_MOBILITY' },
    });
    expect(sourceRef.sourceMirrorId).toBe(hmId);

    const hmLink = await prisma.vehicleDataSourceLink.findFirstOrThrow({
      where: { vehicleId: result.synqdriveVehicleId, sourceType: 'HIGH_MOBILITY', isActive: true },
    });
    const ci = readConnectionIdentityFromLinkMetadata(hmLink.metadata);
    expect(ci?.verifiedModality).toBeTruthy();
    expect(ci?.providerSourceLinkId).toBe(hmLink.id);
    expect(ci?.preActivationProviderSourceRefId).toBe(sourceRef.id);

    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findMany({
      where: { organizationId: orgId, idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.eventType).toBe('VEHICLE_ACTIVATED');
    expect(outbox[0]!.vehicleId).toBe(result.synqdriveVehicleId);
  });

  it('PG-03-B idempotency: one case, one vehicle, one HM link, one outbox', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const dto = iceHmDto(hmId, orgId);
    const first = await harness.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) });
    const second = await harness.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) });
    expect(second.synqdriveVehicleId).toBe(first.synqdriveVehicleId);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    const idemKey = hmOnlyCanonicalRegistrationIdempotencyKey(orgId, hmId);
    expect(await prisma.vehicleOnboardingCase.count({ where: { organizationId: orgId, idempotencyKey: idemKey } })).toBe(1);
    expect(
      await prisma.vehicleDataSourceLink.count({
        where: { vehicleId: first.synqdriveVehicleId, sourceType: 'HIGH_MOBILITY', isActive: true },
      }),
    ).toBe(1);
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId } })).toBe(1);
  });

  it('PG-03-C concurrent register serializes to one vehicle (dual Prisma clients)', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const harnessB = createHmOnlyCanonicalPgHarness(prismaB);
    const dto = iceHmDto(hmId, orgId);
    const [r1, r2] = await Promise.allSettled([
      harness.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) }),
      harnessB.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) }),
    ]);
    const successes = [r1, r2].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof harness.hmOnlyCanonical.register>>
    >[];
    expect(successes.length).toBe(1);
    const vehicleId = successes[0]!.value.synqdriveVehicleId;
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId, vehicleId } })).toBe(1);
  });

  it('PG-03-D1 billable fixture: duplicate outbox processing yields exactly one quantity event', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await harness.hmOnlyCanonical.register({
      dto: iceHmDto(hmId, orgId),
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
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.eventId);
    const events = await prisma.billingQuantityEvent.findMany({
      where: {
        organizationId: orgId,
        vehicleId: result.synqdriveVehicleId,
        eventType: BillingQuantityEventType.VEHICLE_CONNECTED,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.idempotencyKey).toBe(billingKey);
  });

  it('PG-03-D2 non-billable org (no base plan): zero quantity events after outbox processing', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await harness.hmOnlyCanonical.register({
      dto: iceHmDto(hmId, orgId),
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
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.eventId);
    expect(
      await prisma.billingQuantityEvent.count({
        where: { organizationId: orgId, idempotencyKey: billingKey },
      }),
    ).toBe(0);
  });

  it('PG-03-E rejects cross-tenant HM adoption', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgA);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgB, model: 'X1', year: 2021, fuelType: 'GASOLINE' },
        access: tenantAccess(orgB),
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgB } })).toBe(0);
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('PG-03-F rejects unapproved clearance', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId, { clearanceStatus: 'CLEARANCE_PENDING' });
    await expect(
      harness.hmOnlyCanonical.register({ dto: iceHmDto(hmId, orgId), access: tenantAccess(orgId) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-G rejects missing HM mirror', async () => {
    const orgId = await createOrg(prisma);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: randomUUID(), organizationId: orgId, model: 'X1', year: 2021 },
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
    const { hmId: hm2 } = await createApprovedHmMirror(prisma, orgId, { vin, packageType: 'FULL_TELEMETRY' });
    await expect(
      harness.hmOnlyCanonical.register({ dto: iceHmDto(hm2, orgId), access: tenantAccess(orgId) }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PG-03-I rejects hvBatteryReferenceServiceEventId on ingress', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: {
          ...iceHmDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
          hvBatteryUsableCapacityKwh: 64,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
          hvBatteryReferenceServiceEventId: 'evt-forbidden',
        },
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-J BEV without substantiating document blocks readiness (no vehicle)', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: {
          ...iceHmDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
          hvBatteryUsableCapacityKwh: 64,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
        },
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-J2 BEV with confirmed onboarding document can activate', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const docId = await createOnboardingBatteryDocument(prisma, orgId, 64);
    const result = await harness.hmOnlyCanonical.register({
      dto: {
        ...iceHmDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
        hvBatteryReferenceDocumentId: docId,
      },
      access: tenantAccess(orgId),
    });
    expect(result.synqdriveVehicleId).toBeTruthy();
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: result.synqdriveVehicleId } });
    expect(vehicle.fuelType).toBe(FuelType.ELECTRIC);
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
        dto: iceHmDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i3', year: 2020 }),
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('PG-03-L rejects missing product entitlement', async () => {
    const orgId = await createOrg(prisma, false);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: iceHmDto(hmId, orgId, { fuelType: 'GASOLINE' }),
        access: tenantAccess(orgId),
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-03-O rejects missing operator model/year', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await expect(
      harness.hmOnlyCanonical.register({
        dto: { hmVehicleId: hmId, organizationId: orgId, fuelType: 'GASOLINE' },
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
  });

  it('PG-03-M registered HM mirror returns idempotent success without second outbox', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const dto = iceHmDto(hmId, orgId);
    const first = await harness.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) });
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
    });
    const second = await harness.hmOnlyCanonical.register({ dto, access: tenantAccess(orgId) });
    expect(second.synqdriveVehicleId).toBe(first.synqdriveVehicleId);
    const hm = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(hm.vin).toBe(vin);
    expect(hm.registrationState).toBe('REGISTERED');
    const outboxAfter = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
    });
    expect(outboxAfter).toBe(outboxBefore);
    expect(outboxAfter).toBe(1);
  });

  it('PG-03-P blocks legacy REGISTERED HM with linked vehicle and no completed canonical case', async () => {
    const orgId = await createOrg(prisma);
    const legacyVehicleId = randomUUID();
    const vin = `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.vehicle.create({
      data: {
        id: legacyVehicleId,
        organizationId: orgId,
        vin,
        make: 'BMW',
        model: 'Legacy',
        year: 2019,
        fuelType: FuelType.GASOLINE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    const { hmId } = await createApprovedHmMirror(prisma, orgId, {
      vin,
      registrationState: 'REGISTERED',
      synqdriveVehicleId: legacyVehicleId,
    });
    const vehiclesBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } });
  await expect(
      harness.hmOnlyCanonical.register({
        dto: iceHmDto(hmId, orgId),
        access: tenantAccess(orgId),
      }),
    ).rejects.toMatchObject({ code: 'HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehiclesBefore);
    const legacyUnchanged = await prisma.vehicle.findUniqueOrThrow({ where: { id: legacyVehicleId } });
    expect(legacyUnchanged.model).toBe('Legacy');
    expect(
      await prisma.vehicleDataSourceLink.count({ where: { vehicleId: legacyVehicleId, isActive: true } }),
    ).toBe(0);
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } })).toBe(outboxBefore);
    expect(
      await prisma.vehicleOnboardingCase.count({
        where: { organizationId: orgId, status: 'COMPLETED', vehicleId: legacyVehicleId },
      }),
    ).toBe(0);
  });

  it('PG-03-N activation fault AFTER_MIRROR_UPDATE rolls back then canonical retry succeeds', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const hmRecord = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(orgId, hmId);
    const adopted = await harness.sourceAdoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: tenantAccess(orgId).actorUserId,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      idempotencyKey,
    });
    let token = adopted.concurrencyToken ?? '';
    const adminBody = buildHmOnlyAdminBaselineDraft(
      iceHmDto(hmId, orgId),
      hmRecord,
    );
    const admin = await harness.capture.updateAdminBaseline({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      body: adminBody,
      expectedConcurrencyToken: token,
    });
    token = admin.case.concurrencyToken ?? '';
    const identity = await harness.capture.updateIdentityOperatorModelYear({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      model: 'X3',
      year: 2021,
      expectedConcurrencyToken: token,
    });
    token = identity.case.concurrencyToken ?? '';
    const fuel = await harness.capture.updateIdentityOperatorFuelType({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      fuelType: FuelType.GASOLINE,
      expectedConcurrencyToken: token,
    });
    token = fuel.case.concurrencyToken ?? '';
    await harness.capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: adopted.id,
      actorUserId: tenantAccess(orgId).actorUserId,
      body: technicalBaselineV2Empty(),
      expectedConcurrencyToken: token,
    });
    const readiness = await harness.readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: adopted.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: tenantAccess(orgId).actorUserId,
    });
    expect(readiness.decision).toBe('READY');
    const stage: Vo3ActivationFaultStage = 'AFTER_MIRROR_UPDATE';
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: adopted.id,
        actorUserId: tenantAccess(orgId).actorUserId,
        faultAfterStage: stage,
      }),
    ).rejects.toThrow('VO3_FAULT_INJECTION');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
    const hmAfterFault = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    expect(hmAfterFault.registrationState).not.toBe('REGISTERED');
    expect(hmAfterFault.synqdriveVehicleId).toBeNull();
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } })).toBe(0);
    expect(
      await prisma.vehicleDataSourceLink.count({
        where: { sourceType: 'HIGH_MOBILITY', vehicle: { organizationId: orgId } },
      }),
    ).toBe(0);
    const retry = await harness.hmOnlyCanonical.register({
      dto: iceHmDto(hmId, orgId, { model: 'X3', year: 2021 }),
      access: tenantAccess(orgId),
    });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId, vehicleId: retry.synqdriveVehicleId } })).toBe(1);
    expect(adminBody.version).toBe(VEHICLE_ADMIN_BASELINE_DRAFT_VERSION);
    expect(vin).toBeTruthy();
  });
});
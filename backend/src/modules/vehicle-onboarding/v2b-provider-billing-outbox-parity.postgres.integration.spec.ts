/**
 * V2B-PR5 — Provider-only billing / outbox parity (PostgreSQL).
 * Gate: `V2B_PROVIDER_BILLING_PARITY_PG=1` (disposable CI DB only).
 */
import {
  BillingQuantityEventType,
  FuelType,
  PrismaClient,
  VehicleRegistryLifecycle,
  VehicleRegistryLifecycleOutboxStatus,
} from '@prisma/client';
import { BillingQuantityService } from '@modules/billing/billing-quantity.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { HighMobilityRegistrationService } from '@modules/high-mobility/high-mobility-registration.service';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import { buildRegistryActivateBillingIdempotencyKey } from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';
import { insertDimoMirrorForPostgresTests } from './testing/dimo-mirror-postgres.fixture';
import { createHmOnlyCanonicalPgHarness } from './testing/v2b-hm-only-canonical-pg.harness';
import {
  createRentalOrg,
  ensureBasePlan,
  registryBillingProcessor,
} from './testing/v2b-registry-billing-pg.helpers';
import { createVehicleRowForIntegrationHarness } from '@modules/vehicles/testing/vehicle-row-integration.harness';
import { legacyManualVehicleRegistrationDisabledException } from '@modules/vehicles/legacy-manual-vehicle-registration.errors';
import { masterDimoHarness } from './testing/v2b-provider-billing-parity.pg.harness';

const run = process.env.V2B_PROVIDER_BILLING_PARITY_PG === '1';
const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };

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
      synqdriveVehicleId: null,
    },
  });
  return { hmId, vin };
}

function hmLegacyService(prisma: PrismaClient) {
  const config = {
    get: (key: string) =>
      key === 'vehicleRegistrationConvergence'
        ? { hmOnlyCanonicalEnabled: false, billingSingleRailEnabled: false }
        : undefined,
  } as unknown as ConfigService;
  return new HighMobilityRegistrationService(prisma as never, config);
}

function hmDto(hmId: string, orgId: string): RegisterHmOnlyVehicleDto {
  return {
    hmVehicleId: hmId,
    organizationId: orgId,
    model: 'X5',
    year: 2022,
    fuelType: 'GASOLINE',
    vehicleType: 'SEDAN',
  };
}

(run ? describe : describe.skip)('V2B-PR5 provider billing outbox parity (postgres)', () => {
  jest.setTimeout(180_000);
  const prisma = new PrismaClient();
  const hmHarness = createHmOnlyCanonicalPgHarness(prisma);
  const dimoHarness = masterDimoHarness(prisma);
  const hmLegacy = hmLegacyService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function assertAuthoritativePlusOneQuantity(
    orgId: string,
    vehicleId: string,
    billingKey: string,
    expectedOccurredAt: Date,
  ) {
    const events = await prisma.billingQuantityEvent.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        eventType: BillingQuantityEventType.VEHICLE_CONNECTED,
      },
    });
    expect(events).toHaveLength(1);
    const row = events[0]!;
    expect(row.organizationId).toBe(orgId);
    expect(row.vehicleId).toBe(vehicleId);
    expect(row.idempotencyKey).toBe(billingKey);
    expect(row.quantityAfter - row.quantityBefore).toBe(1);
    expect(row.delta).toBe(1);
    expect(row.effectiveAt.toISOString()).toBe(expectedOccurredAt.toISOString());
    expect(billingKey).toMatch(/^vehicle-registry:.+:billing-activate:v1$/);
    return row;
  }

  async function assertSingleBillableActivation(
    orgId: string,
    vehicleId: string,
    caseId: string,
  ) {
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseId), vehicleId },
    });
    expect(outbox.eventType).toBe('VEHICLE_ACTIVATED');
    expect(outbox.organizationId).toBe(orgId);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_ACTIVATED' },
      }),
    ).toBe(1);
    const processor = registryBillingProcessor(prisma);
    await processor.processRow(outbox.id);
    await processor.processRow(outbox.id);
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.eventId);
    await assertAuthoritativePlusOneQuantity(orgId, vehicleId, billingKey, outbox.occurredAt);
    const published = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(published.status).toBe(VehicleRegistryLifecycleOutboxStatus.PUBLISHED);
    return { outbox, billingKey };
  }

  it('PG-05-A DIMO first activation: one outbox, duplicate processing → one quantity event', async () => {
    const orgId = await createRentalOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const { vehicle } = await dimoHarness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: vehicle.id, status: 'COMPLETED' },
    });
    await assertSingleBillableActivation(orgId, vehicle.id, caseRow.id);
  });

  it('PG-05-B HM_ONLY canonical: billing idempotency matches DIMO registry rail', async () => {
    const orgId = await createRentalOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await hmHarness.hmOnlyCanonical.register({
      dto: hmDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });
    const { billingKey } = await assertSingleBillableActivation(
      orgId,
      result.synqdriveVehicleId,
      caseRow.id,
    );
    expect(billingKey).toMatch(/^vehicle-registry:.+:billing-activate:v1$/);
  });

  it('PG-05-C HM legacy (canonical flag OFF): EXPECTED_LEGACY_GAP_PRESERVED — vehicle only, zero outbox/billing', async () => {
    const orgId = await createRentalOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await hmLegacy.registerHmOnlyVehicle(hmDto(hmId, orgId), {
      tenantOrganizationId: orgId,
      isMasterAdmin: false,
      actorUserId: null,
    });
    expect(result.synqdriveVehicleId).toBeTruthy();
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { organizationId: orgId, vehicleId: result.synqdriveVehicleId },
      }),
    ).toBe(0);
    expect(
      await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } }),
    ).toBe(0);
    expect(
      await prisma.vehicleOnboardingCase.count({ where: { organizationId: orgId } }),
    ).toBe(0);
  });

  it('PG-05-D sequential duplicate canonical registration does not duplicate outbox', async () => {
    const orgId = await createRentalOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    const first = await hmHarness.hmOnlyCanonical.register({ dto: hmDto(hmId, orgId), access });
    const second = await hmHarness.hmOnlyCanonical.register({ dto: hmDto(hmId, orgId), access });
    expect(second.synqdriveVehicleId).toBe(first.synqdriveVehicleId);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { organizationId: orgId, vehicleId: first.synqdriveVehicleId },
      }),
    ).toBe(1);
  });

  it('PG-05-E provider reconnection: second HM legacy register fails closed (no extra billing)', async () => {
    const orgId = await createRentalOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    await hmLegacy.registerHmOnlyVehicle(hmDto(hmId, orgId), access);
    await expect(hmLegacy.registerHmOnlyVehicle(hmDto(hmId, orgId), access)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('PG-05-F cross-tenant HM canonical rejected; no org-B outbox or billing', async () => {
    const orgA = await createRentalOrg(prisma);
    const orgB = await createRentalOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgA);
    await expect(
      hmHarness.hmOnlyCanonical.register({
        dto: { ...hmDto(hmId, orgB), organizationId: orgB },
        access: { tenantOrganizationId: orgB, isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toThrow();
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgB } })).toBe(0);
    expect(await prisma.billingQuantityEvent.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('PG-05-G non-billable org: canonical HM still writes outbox; zero quantity after processing', async () => {
    const orgId = await createRentalOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await hmHarness.hmOnlyCanonical.register({
      dto: hmDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
    });
    const processor = registryBillingProcessor(prisma);
    await processor.processRow(outbox.id);
    expect(
      await prisma.billingQuantityEvent.count({
        where: {
          organizationId: orgId,
          idempotencyKey: buildRegistryActivateBillingIdempotencyKey(outbox.eventId),
        },
      }),
    ).toBe(0);
  });

  it('PG-05-H existing harness manual fleet row: edit allowed; no new activation outbox', async () => {
    const orgId = await createRentalOrg(prisma);
    const vehicle = await createVehicleRowForIntegrationHarness(
      prisma,
      orgId,
      {
        vin: `LEG${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        make: 'Legacy',
        model: 'ManualFleet',
        year: 2019,
        fuelType: FuelType.GASOLINE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      } as never,
      undefined,
      { invokeLegacyBillingHook: false },
    );
    const billingBefore = await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } });
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { model: 'ManualFleet-Edited', year: 2020 },
    });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({ where: { vehicleId: vehicle.id } }),
    ).toBe(0);
    expect(await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } })).toBe(
      billingBefore,
    );
  });

  it('PG-05-I manual public registration remains unavailable (retirement contract)', () => {
    const err = legacyManualVehicleRegistrationDisabledException();
    expect(err.getResponse()).toMatchObject({ code: 'MANUAL_VEHICLE_REGISTRATION_RETIRED' });
  });

  it('PG-05-K DIMO canonical: durable billing before publish recovers via outbox retry', async () => {
    const orgId = await createRentalOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 0);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const { vehicle } = await dimoHarness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: vehicle.id, status: 'COMPLETED' },
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id), vehicleId: vehicle.id },
    });
    expect(outbox.status).toBe(VehicleRegistryLifecycleOutboxStatus.PENDING);
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.eventId);
    const quantity = new BillingQuantityService(prisma as never);
    await quantity.recordVehicleLicenseAdded({
      organizationId: orgId,
      subscriptionId: baseItem.subscriptionId,
      subscriptionItemId: baseItem.id,
      vehicleId: vehicle.id,
      effectiveAt: outbox.occurredAt,
      idempotencyKey: billingKey,
      retroactiveAuthorized: true,
    });
    const provisionSpy = jest.spyOn(
      BillingQuantityVehicleIntegration.prototype,
      'onVehicleProvisioned',
    );
    const processor = registryBillingProcessor(prisma);
    const outcome = await processor.processRow(outbox.id);
    expect(outcome).toBe('published');
    expect(provisionSpy).toHaveBeenCalledTimes(1);
    provisionSpy.mockRestore();
    await assertAuthoritativePlusOneQuantity(orgId, vehicle.id, billingKey, outbox.occurredAt);
    const published = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(published.status).toBe(VehicleRegistryLifecycleOutboxStatus.PUBLISHED);
  });

  it('PG-05-L HM canonical: pre-billing validation failure retries to single quantity event', async () => {
    const orgId = await createRentalOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const result = await hmHarness.hmOnlyCanonical.register({
      dto: hmDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: result.synqdriveVehicleId, status: 'COMPLETED' },
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
    });
    const processor = registryBillingProcessor(prisma);
    await prisma.vehicle.update({
      where: { id: result.synqdriveVehicleId },
      data: { registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED },
    });
    expect(await processor.processRow(outbox.id)).toBe('retry');
    expect(
      await prisma.billingQuantityEvent.count({
        where: { organizationId: orgId, vehicleId: result.synqdriveVehicleId },
      }),
    ).toBe(0);
    await prisma.vehicle.update({
      where: { id: result.synqdriveVehicleId },
      data: { registryLifecycle: VehicleRegistryLifecycle.ACTIVE },
    });
    await prisma.vehicleRegistryLifecycleOutbox.update({
      where: { id: outbox.id },
      data: { nextRetryAt: null },
    });
    expect(await processor.processRow(outbox.id)).toBe('published');
    const billingKey = buildRegistryActivateBillingIdempotencyKey(outbox.eventId);
    await assertAuthoritativePlusOneQuantity(
      orgId,
      result.synqdriveVehicleId,
      billingKey,
      outbox.occurredAt,
    );
  });

  it('PG-05-J DIMO idempotent retry preserves single outbox before billing', async () => {
    const orgId = await createRentalOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const first = await dimoHarness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    await dimoHarness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId: first.vehicle.id, eventType: 'VEHICLE_ACTIVATED' },
      }),
    ).toBe(1);
  });
});
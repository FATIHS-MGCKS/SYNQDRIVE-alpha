/**
 * VO-5B-AB1 activation lifecycle → billing quantity bridge (PostgreSQL).
 */
import {
  BillingQuantityEventType,
  BusinessType,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycleOutboxStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ACTIVATION_OUTBOX_PAYLOAD_VERSION } from '@modules/vehicle-onboarding/contracts/vo-document-versions';
import { VehicleOffboardingService } from '@modules/vehicle-onboarding/services/vehicle-offboarding.service';
import { VehicleRegistryLifecycleOutboxProcessor } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { VehicleRegistryLifecycleOutboxRepository } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.repository';
import { BillingVehicleRegistryOffboardProjection } from './registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { BillingQuantityService } from './billing-quantity.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingQuantityVehicleIntegration } from './billing-quantity-vehicle.integration';
import { buildRegistryActivateBillingIdempotencyKey } from './registry-lifecycle/validate-vehicle-activated-registry-event';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';

const run = process.env.VO5B_AB1_REGISTRY_BILLING_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5B-AB1 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
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
  return { ...item, subscriptionId: subId };
}

async function createActiveVehicle(prisma: PrismaClient, orgId: string) {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, registry_lifecycle,
      status, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType",
      'ACTIVE'::"VehicleRegistryLifecycle",
      'AVAILABLE'::"VehicleStatus",
      NOW(), NOW()
    )
  `;
  return vehicleId;
}

function buildProcessor(prisma: PrismaClient) {
  const projection = new BillingVehicleRegistryOffboardProjection(
    prisma as any,
    new BillableVehiclesService(prisma as any),
    new BillingQuantityService(prisma as any),
  );
  const billingQuantity = new BillingQuantityVehicleIntegration(
    new BillingQuantityService(prisma as any),
    new BillableVehiclesService(prisma as any),
    projection,
  );
  return new VehicleRegistryLifecycleOutboxProcessor(
    prisma as any,
    new VehicleRegistryLifecycleOutboxRepository(prisma as any),
    projection,
    billingQuantity,
  );
}

async function seedActivatedOutbox(
  prisma: PrismaClient,
  input: {
    orgId: string;
    vehicleId: string;
    occurredAt: Date;
    eventId?: string;
    onboardingCaseId?: string;
  },
) {
  const eventId = input.eventId ?? randomUUID();
  const onboardingCaseId = input.onboardingCaseId ?? randomUUID();
  const outboxId = randomUUID();
  await prisma.vehicleRegistryLifecycleOutbox.create({
    data: {
      id: outboxId,
      eventId,
      eventType: 'VEHICLE_ACTIVATED',
      vehicleId: input.vehicleId,
      organizationId: input.orgId,
      payloadVersion: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
      payload: {
        version: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
        vehicleId: input.vehicleId,
        organizationId: input.orgId,
        onboardingCaseId,
        registryLifecycle: 'ACTIVE',
        activatedAt: input.occurredAt.toISOString(),
        sourceProviders: ['DIMO'],
      },
      occurredAt: input.occurredAt,
      idempotencyKey: `vehicle-onboarding:VEHICLE_ACTIVATED:v1:${onboardingCaseId}`,
      status: VehicleRegistryLifecycleOutboxStatus.PENDING,
      retryCount: 0,
    },
  });
  return { outboxId, eventId, onboardingCaseId };
}

(run ? describe : describe.skip)('VO-5B-AB1 activation billing bridge (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const processor = buildProcessor(prisma);
  const offboarding = new VehicleOffboardingService(prisma as any);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('A: first activation produces exactly one VEHICLE_CONNECTED', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const occurredAt = new Date('2026-08-01T09:30:00.000Z');
    const { outboxId, eventId } = await seedActivatedOutbox(prisma, {
      orgId,
      vehicleId,
      occurredAt,
    });

    await processor.processRow(outboxId);

    const events = await prisma.billingQuantityEvent.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        eventType: BillingQuantityEventType.VEHICLE_CONNECTED,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.idempotencyKey).toBe(buildRegistryActivateBillingIdempotencyKey(eventId));
    const published = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outboxId },
    });
    expect(published.status).toBe(VehicleRegistryLifecycleOutboxStatus.PUBLISHED);
  });

  it('B: delayed processing keeps effectiveAt at activation occurredAt', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const occurredAt = new Date('2026-05-10T08:00:00.000Z');
    const { outboxId } = await seedActivatedOutbox(prisma, { orgId, vehicleId, occurredAt });

    await new Promise((resolve) => setTimeout(resolve, 25));
    const beforeProcess = new Date();
    await processor.processRow(outboxId);

    const event = await prisma.billingQuantityEvent.findFirstOrThrow({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_CONNECTED },
    });
    expect(event.effectiveAt.toISOString()).toBe(occurredAt.toISOString());
    expect(event.effectiveAt.getTime()).toBeLessThan(beforeProcess.getTime() - 1000);
  });

  it('C: duplicate delivery remains one quantity event', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const occurredAt = new Date('2026-04-01T12:00:00.000Z');
    const { outboxId } = await seedActivatedOutbox(prisma, { orgId, vehicleId, occurredAt });

    for (let i = 0; i < 5; i += 1) {
      await processor.processRow(outboxId);
    }

    const count = await prisma.billingQuantityEvent.count({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_CONNECTED },
    });
    expect(count).toBe(1);
  });

  it('D: concurrent delivery converges to one quantity event', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const occurredAt = new Date('2026-03-15T11:00:00.000Z');
    const { outboxId } = await seedActivatedOutbox(prisma, { orgId, vehicleId, occurredAt });

    await Promise.all([
      processor.processRow(outboxId),
      processor.processRow(outboxId),
      processor.processRow(outboxId),
    ]);

    const count = await prisma.billingQuantityEvent.count({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_CONNECTED },
    });
    expect(count).toBe(1);
  });

  it('E: retry after durable billing write converges without duplicate', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const occurredAt = new Date('2026-02-20T07:00:00.000Z');
    const eventId = randomUUID();
    const idempotencyKey = buildRegistryActivateBillingIdempotencyKey(eventId);

    const quantity = new BillingQuantityService(prisma as any);
    await quantity.recordVehicleLicenseAdded({
      organizationId: orgId,
      subscriptionId: baseItem.subscriptionId,
      subscriptionItemId: baseItem.id,
      vehicleId,
      effectiveAt: occurredAt,
      idempotencyKey,
      retroactiveAuthorized: true,
    });

    const { outboxId } = await seedActivatedOutbox(prisma, {
      orgId,
      vehicleId,
      occurredAt,
      eventId,
    });

    const outcome = await processor.processRow(outboxId);
    expect(outcome).toBe('published');
    const count = await prisma.billingQuantityEvent.count({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_CONNECTED },
    });
    expect(count).toBe(1);
  });

  it('F: cross-tenant activation event fails closed', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    await ensureBasePlan(prisma, orgA, 0);
    const vehicleId = await createActiveVehicle(prisma, orgA);
    const occurredAt = new Date('2026-01-10T06:00:00.000Z');
    const outboxId = randomUUID();
    const eventId = randomUUID();
    await prisma.vehicleRegistryLifecycleOutbox.create({
      data: {
        id: outboxId,
        eventId,
        eventType: 'VEHICLE_ACTIVATED',
        vehicleId,
        organizationId: orgB,
        payloadVersion: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
        payload: {
          version: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
          vehicleId,
          organizationId: orgB,
          onboardingCaseId: randomUUID(),
          registryLifecycle: 'ACTIVE',
          activatedAt: occurredAt.toISOString(),
          sourceProviders: [],
        },
        occurredAt,
        idempotencyKey: randomUUID(),
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
        retryCount: 0,
      },
    });

    const outcome = await processor.processRow(outboxId);
    expect(outcome).toBe('failed');
    const qty = await prisma.billingQuantityEvent.count({
      where: { vehicleId, organizationId: orgB },
    });
    expect(qty).toBe(0);
  });

  it('G: activate then offboard temporal symmetry', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 0);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const t1 = new Date('2026-09-01T10:00:00.000Z');
    const { outboxId: activateOutboxId } = await seedActivatedOutbox(prisma, {
      orgId,
      vehicleId,
      occurredAt: t1,
    });
    await processor.processRow(activateOutboxId);

    const t2 = new Date('2026-09-15T18:00:00.000Z');
    jest.useFakeTimers({ now: t2 });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    jest.useRealTimers();

    const offboardOutbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    await processor.processRow(offboardOutbox.id);

    const connected = await prisma.billingQuantityEvent.findFirstOrThrow({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_CONNECTED },
    });
    const disconnected = await prisma.billingQuantityEvent.findFirstOrThrow({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED },
    });
    expect(connected.effectiveAt.getTime()).toBeLessThanOrEqual(disconnected.effectiveAt.getTime());
  });
});

/**
 * VO-5B registry lifecycle → billing quantity bridge (PostgreSQL).
 */
import {
  BillingBillableVehicleAssignmentStatus,
  BillingQuantityEventType,
  BusinessType,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycleOutboxStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOffboardingService } from '@modules/vehicle-onboarding/services/vehicle-offboarding.service';
import { VehicleRegistryLifecycleOutboxProcessor } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { BillingVehicleRegistryOffboardProjection } from './registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { BillingQuantityService } from './billing-quantity.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import {
  buildRegistryOffboardBillingIdempotencyKey,
  validateVehicleOffboardedRegistryEvent,
} from './registry-lifecycle/validate-vehicle-offboarded-registry-event';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';

const run = process.env.VO5B_REGISTRY_BILLING_PG === '1';

async function createApproverUser(prisma: PrismaClient, orgId: string) {
  const userId = randomUUID();
  const email = `vo5b-${randomUUID()}@example.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, created_at, updated_at)
    VALUES (
      ${userId},
      ${email},
      'VO5B Approver',
      'ACTIVE'::"UserStatus",
      NOW(),
      NOW()
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO organization_memberships (
      id, user_id, organization_id, role, status, permissions, created_at, updated_at
    ) VALUES (
      ${randomUUID()},
      ${userId},
      ${orgId},
      'ORG_ADMIN'::"MembershipRole",
      'ACTIVE'::"MembershipStatus",
      '{}'::jsonb,
      NOW(),
      NOW()
    )
  `;
  return userId;
}

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5B ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function ensureBasePlan(prisma: PrismaClient, orgId: string, quantity = 1) {
  const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({
    where: { key: 'FLEET' },
  });
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
  return { ...item, subscriptionId: subId };
}

async function seedVehicleLicenseConnected(
  prisma: PrismaClient,
  orgId: string,
  baseItem: { id: string; subscriptionId: string },
  vehicleId: string,
  effectiveAt = new Date('2025-06-01T00:00:00.000Z'),
) {
  const quantity = new BillingQuantityService(prisma as any);
  await quantity.recordVehicleLicenseAdded({
    organizationId: orgId,
    subscriptionId: baseItem.subscriptionId,
    subscriptionItemId: baseItem.id,
    vehicleId,
    effectiveAt,
    idempotencyKey: `vo5b-test:vehicle-connected:${vehicleId}`,
    retroactiveAuthorized: true,
  });
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
  await prisma.vehicleOrganizationAssignment.create({
    data: {
      id: randomUUID(),
      vehicleId,
      organizationId: orgId,
      validFrom: new Date('2020-01-01'),
      assignmentReason: 'TEST_FIXTURE',
      assignmentSource: 'VO5B_TEST',
    },
  });
  return vehicleId;
}

(run ? describe : describe.skip)('VO-5B registry billing bridge (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const offboarding = new VehicleOffboardingService(prisma as any);
  const projection = new BillingVehicleRegistryOffboardProjection(
    prisma as any,
    new BillableVehiclesService(prisma as any),
    new BillingQuantityService(prisma as any),
  );
  const processor = new VehicleRegistryLifecycleOutboxProcessor(
    prisma as any,
    projection,
  );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('legacy implicit billable vehicle offboard decrements quantity at occurredAt', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    const occurredBefore = new Date();
    const actorUserId = await createApproverUser(prisma, orgId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    expect(outbox.occurredAt.getTime()).toBeGreaterThanOrEqual(occurredBefore.getTime() - 1000);

    const validated = validateVehicleOffboardedRegistryEvent(outbox);
    await expect(projection.onVehicleOffboardedLifecycleEvent(validated)).resolves.toMatchObject({
      outcome: 'quantity_decrement',
    });

    const outcome = await processor.processRow(outbox.id);
    expect(outcome).toBe('published');

    const qtyEvent = await prisma.billingQuantityEvent.findUniqueOrThrow({
      where: { idempotencyKey: buildRegistryOffboardBillingIdempotencyKey(outbox.eventId) },
    });
    expect(qtyEvent.eventType).toBe(BillingQuantityEventType.VEHICLE_DISCONNECTED);
    expect(qtyEvent.delta).toBe(-1);
    expect(qtyEvent.effectiveAt.toISOString()).toBe(outbox.occurredAt.toISOString());
    expect(qtyEvent.actorUserId).toBe(actorUserId);

    const updatedItem = await prisma.billingSubscriptionItem.findUniqueOrThrow({
      where: { id: baseItem.id },
    });
    expect(updatedItem.quantity).toBe(0);

    const billable = await new BillableVehiclesService(prisma as any).getBillableConnectedVehiclesForOrganization(
      orgId,
    );
    expect(billable.billableVehicles.some((v) => v.id === vehicleId)).toBe(false);
  });

  it('duplicate outbox consumption is idempotent', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    expect(await processor.processRow(outbox.id)).toBe('published');
    expect(await processor.processRow(outbox.id)).toBe('skipped');
    expect(
      await prisma.billingQuantityEvent.count({
        where: { idempotencyKey: buildRegistryOffboardBillingIdempotencyKey(outbox.eventId) },
      }),
    ).toBe(1);
  });

  it('ends explicit ACTIVE billing assignment at lifecycle time', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const assignmentId = randomUUID();
    const approverId = await createApproverUser(prisma, orgId);
    await prisma.billingBillableVehicleAssignment.create({
      data: {
        id: assignmentId,
        organizationId: orgId,
        vehicleId,
        subscriptionItemId: baseItem.id,
        billableFrom: new Date('2020-01-01'),
        status: BillingBillableVehicleAssignmentStatus.ACTIVE,
        approvedByUserId: approverId,
      },
    });
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    await processor.processRow(outbox.id);
    const assignment = await prisma.billingBillableVehicleAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
    });
    expect(assignment.status).toBe(BillingBillableVehicleAssignmentStatus.ENDED);
    expect(assignment.billableUntil?.toISOString()).toBe(outbox.occurredAt.toISOString());
    expect(assignment.reasonCode).toBe('REGISTRY_OFFBOARDED');
  });

  it('processes delayed consumer with retroactive effectiveAt at registry occurredAt', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 2);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    await prisma.billingSubscriptionItem.update({
      where: { id: baseItem.id },
      data: { quantity: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await processor.processRow(outbox.id);
    const qtyEvent = await prisma.billingQuantityEvent.findUniqueOrThrow({
      where: { idempotencyKey: buildRegistryOffboardBillingIdempotencyKey(outbox.eventId) },
    });
    expect(qtyEvent.effectiveAt.toISOString()).toBe(outbox.occurredAt.toISOString());
  });

  it('demo assignment offboard is quantity noop', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await prisma.billingBillableVehicleAssignment.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        vehicleId,
        subscriptionItemId: baseItem.id,
        billableFrom: new Date('2020-01-01'),
        status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
        reasonCode: 'DEMO',
        approvedByUserId: null,
      },
    });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    await processor.processRow(outbox.id);
    expect(
      await prisma.billingQuantityEvent.count({
        where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED },
      }),
    ).toBe(0);
    const item = await prisma.billingSubscriptionItem.findUniqueOrThrow({
      where: { id: baseItem.id },
    });
    expect(item.quantity).toBe(1);
  });

  it('no active base plan is deterministic noop', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    expect(await processor.processRow(outbox.id)).toBe('published');
    expect(await prisma.billingQuantityEvent.count({ where: { vehicleId } })).toBe(0);
  });

  it('fails closed on multiple effective billable assignments', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const approverId = await createApproverUser(prisma, orgId);
    const firstId = randomUUID();
    const secondId = randomUUID();
    await prisma.billingBillableVehicleAssignment.create({
      data: {
        id: firstId,
        organizationId: orgId,
        vehicleId,
        subscriptionItemId: baseItem.id,
        billableFrom: new Date('2020-01-01'),
        status: BillingBillableVehicleAssignmentStatus.ACTIVE,
        approvedByUserId: approverId,
      },
    });
    await prisma.billingBillableVehicleAssignment.create({
      data: {
        id: secondId,
        organizationId: orgId,
        vehicleId,
        subscriptionItemId: baseItem.id,
        billableFrom: new Date('2020-01-01'),
        status: BillingBillableVehicleAssignmentStatus.ACTIVE,
        approvedByUserId: approverId,
      },
    });
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    expect(await processor.processRow(outbox.id)).toBe('retry');
    const pending = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(pending.status).toBe(VehicleRegistryLifecycleOutboxStatus.PENDING);
    expect(pending.lastError).toContain('multiple_effective_billing_assignments');
    expect(
      await prisma.billingQuantityEvent.count({
        where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED },
      }),
    ).toBe(0);
  });

  it('malformed payload fails closed without billing mutation', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    await prisma.vehicleRegistryLifecycleOutbox.update({
      where: { id: outbox.id },
      data: {
        payload: { version: 1, vehicleId, organizationId: orgId },
        payloadVersion: 1,
      },
    });
    expect(await processor.processRow(outbox.id)).toBe('failed');
    expect(await prisma.billingQuantityEvent.count({ where: { vehicleId } })).toBe(0);
  });

  it('projection replay after billing write is idempotent (crash-before-ack safe)', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    const validated = {
      outboxId: outbox.id,
      eventId: outbox.eventId,
      organizationId: orgId,
      vehicleId,
      occurredAt: outbox.occurredAt,
      payloadVersion: outbox.payloadVersion,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
    };
    await projection.onVehicleOffboardedLifecycleEvent(validated);
    await projection.onVehicleOffboardedLifecycleEvent(validated);
    expect(
      await prisma.billingQuantityEvent.count({
        where: { idempotencyKey: buildRegistryOffboardBillingIdempotencyKey(outbox.eventId) },
      }),
    ).toBe(1);
  });

  it('marks outbox PUBLISHED only after billing projection succeeds', async () => {
    const orgId = await createOrg(prisma);
    const baseItem = await ensureBasePlan(prisma, orgId, 1);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    await seedVehicleLicenseConnected(prisma, orgId, baseItem, vehicleId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId },
    });
    expect(outbox.status).toBe(VehicleRegistryLifecycleOutboxStatus.PENDING);
    await processor.processRow(outbox.id);
    const published = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(published.status).toBe(VehicleRegistryLifecycleOutboxStatus.PUBLISHED);
    expect(published.publishedAt).not.toBeNull();
  });
});

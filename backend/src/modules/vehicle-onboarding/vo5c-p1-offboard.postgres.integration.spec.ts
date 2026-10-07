/**
 * VO-5C-P1 Master Admin safe offboard HTTP authority (PostgreSQL).
 */
import {
  BillingQuantityEventType,
  BusinessType,
  PrismaClient,
  ProductSlug,
  TripStatus,
  VehicleRegistryLifecycleOutboxStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { VehicleRegistryLifecycleOutboxProcessor } from './registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { VehicleRegistryLifecycleOutboxRepository } from './registry-lifecycle/vehicle-registry-lifecycle-outbox.repository';
import { BillingVehicleRegistryOffboardProjection } from '@modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { BillingQuantityService } from '@modules/billing/billing-quantity.service';
import { BillableVehiclesService } from '@modules/billing/billable-vehicles.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';

const run = process.env.VO5C_P1_OFFBOARD_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5C ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
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
  return { vehicleId, vin };
}

async function createCustomer(prisma: PrismaClient, orgId: string) {
  const id = randomUUID();
  await prisma.customer.create({
    data: {
      id,
      organizationId: orgId,
      firstName: 'VO5C',
      lastName: 'Customer',
    },
  });
  return id;
}

function buildOffboardStack(prisma: PrismaClient) {
  const offboarding = new VehicleOffboardingService(prisma as any);
  const preflight = new VehicleOffboardPreflightService(prisma as any);
  const httpOffboard = new VehicleOnboardingOffboardService(preflight, offboarding);
  return { offboarding, preflight, httpOffboard };
}

(run ? describe : describe.skip)('VO-5C-P1 offboard HTTP authority (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('HTTP offboard path retains vehicle and writes single VEHICLE_OFFBOARDED outbox', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const idempotencyKey = randomUUID();
    const result = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: randomUUID(),
      idempotencyKey,
    });
    expect(result.registryLifecycle).toBe('OFFBOARDED');
    expect(result.idempotentReplay).toBe(false);
    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(row.registryLifecycle).toBe('OFFBOARDED');
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
    const replay = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: randomUUID(),
      idempotencyKey,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
  });

  it('different idempotency key on OFFBOARDED vehicle fails closed', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const key = randomUUID();
    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: randomUUID(),
      idempotencyKey: key,
    });
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VEHICLE_REGISTRY_INVALID_TRANSITION' });
  });

  it('ACTIVE rental blocks without lifecycle mutation', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'RENTED' },
    });
    const { httpOffboard } = buildOffboardStack(prisma);
    const before = await prisma.vehicleRegistryLifecycleOutbox.count({ where: { vehicleId } });
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'ADMINISTRATIVE_OFFBOARD',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.registryLifecycle).toBe('ACTIVE');
    expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { vehicleId } })).toBe(
      before,
    );
  });

  it('open damage allows offboard with warning', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await prisma.vehicleDamage.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        vehicleId,
        status: 'OPEN',
        damageType: 'SCRATCH',
        severity: 'MINOR',
        locationView: 'FRONT',
      },
    });
    const { httpOffboard } = buildOffboardStack(prisma);
    const result = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    expect(result.warnings).toContain('OPEN_DAMAGE_WARNING');
    expect(result.registryLifecycle).toBe('OFFBOARDED');
  });

  it('ongoing trip blocks offboard', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await prisma.vehicleTrip.create({
      data: {
        id: randomUUID(),
        vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: new Date(),
      },
    });
    const { httpOffboard } = buildOffboardStack(prisma);
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'OFFBOARD_OPERATIONALLY_BLOCKED' });
  });

  it('cross-org vehicle scope fails closed via offboarding authority', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgA);
    const { httpOffboard } = buildOffboardStack(prisma);
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgB,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('billing deprovision once via outbox processor after HTTP offboard', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirstOrThrow({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    const projection = new BillingVehicleRegistryOffboardProjection(
      prisma as any,
      new BillableVehiclesService(prisma as any),
      new BillingQuantityService(prisma as any),
    );
    const outboxRepository = new VehicleRegistryLifecycleOutboxRepository(prisma as any);
    const billingQuantity = new BillingQuantityVehicleIntegration(
      new BillingQuantityService(prisma as any),
      new BillableVehiclesService(prisma as any),
      projection,
    );
    const processor = new VehicleRegistryLifecycleOutboxProcessor(
      prisma as any,
      outboxRepository,
      projection,
      billingQuantity,
    );
    expect(await processor.processRow(outbox.id)).toBe('published');
    const events = await prisma.billingQuantityEvent.findMany({
      where: { vehicleId, eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED },
    });
    expect(events).toHaveLength(1);
    const processed = await prisma.vehicleRegistryLifecycleOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(processed.status).toBe(VehicleRegistryLifecycleOutboxStatus.PUBLISHED);
  });

  it('same-key replay succeeds after post-offboard operational blocker would block new offboard', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const idempotencyKey = randomUUID();
    const first = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: randomUUID(),
      idempotencyKey,
    });
    await prisma.vehicleTrip.create({
      data: {
        id: randomUUID(),
        vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: new Date(),
      },
    });
    const replay = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: randomUUID(),
      idempotencyKey,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.offboardedAt.toISOString()).toBe(first.offboardedAt.toISOString());
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
  });

  it('same key with different reason fails semantic collision', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const idempotencyKey = randomUUID();
    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: randomUUID(),
      idempotencyKey,
    });
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('future committed booking blocks offboard without mutation', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const customerId = await createCustomer(prisma, orgId);
    const bookingId = randomUUID();
    await prisma.booking.create({
      data: {
        id: bookingId,
        organizationId: orgId,
        customerId,
        vehicleId,
        status: 'CONFIRMED',
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 172_800_000),
        totalPriceCents: 10_000,
        currency: 'EUR',
      },
    });
    const { httpOffboard } = buildOffboardStack(prisma);
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'OFFBOARD_OPERATIONALLY_BLOCKED' });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
    ).toMatchObject({ registryLifecycle: 'ACTIVE' });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({ where: { vehicleId } }),
    ).toBe(0);
  });

  it('open handover draft blocks offboard without mutation', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const customerId = await createCustomer(prisma, orgId);
    const bookingId = randomUUID();
    const userId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, created_at, updated_at)
      VALUES (${userId}, ${`u-${userId}@test.local`}, 'Handover User', 'ACTIVE'::"UserStatus", NOW(), NOW())
    `;
    await prisma.booking.create({
      data: {
        id: bookingId,
        organizationId: orgId,
        customerId,
        vehicleId,
        status: 'CONFIRMED',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        totalPriceCents: 10_000,
        currency: 'EUR',
      },
    });
    await prisma.bookingHandoverDraft.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        bookingId,
        kind: 'PICKUP',
        userId,
        payload: {},
      },
    });
    const { httpOffboard } = buildOffboardStack(prisma);
    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'OFFBOARD_OPERATIONALLY_BLOCKED' });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
    ).toMatchObject({ registryLifecycle: 'ACTIVE' });
  });

  it('concurrent same-key offboard converges to one lifecycle fact', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const idempotencyKey = randomUUID();
    const actorUserId = randomUUID();
    const input = {
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT' as const,
      actorUserId,
      idempotencyKey,
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => httpOffboard.offboardVehicle(input)),
    );
    const replays = results.filter((r) => r.idempotentReplay);
    expect(replays.length).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
    expect(new Set(results.map((r) => r.offboardedAt.toISOString())).size).toBe(1);
  });

  it('concurrent different keys on ACTIVE vehicle: one offboard wins, other fails closed', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { httpOffboard } = buildOffboardStack(prisma);
    const actorUserId = randomUUID();
    const outcomes = await Promise.allSettled([
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId,
        idempotencyKey: randomUUID(),
      }),
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
  });
});

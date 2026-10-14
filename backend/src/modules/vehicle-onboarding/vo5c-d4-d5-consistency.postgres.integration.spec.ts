/**
 * VO5C D4/D5 — registry fleet status + durable offboard audit note (PostgreSQL).
 * Run via: npm run test:vehicle-onboarding:vo5c-d4-d5:postgres (VO5C_D4_D5_PG=1).
 */
import {
  BusinessAuditOutboxStatus,
  BusinessType,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '@modules/activity-log/audit.service';
import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import { BusinessAuditOutboxMetricsService } from '@modules/business-audit/business-audit-outbox.metrics';
import { BusinessAuditOutboxProcessorService } from '@modules/business-audit/business-audit-outbox.processor';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { validateVehicleOffboardedRegistryEvent } from '@modules/billing/registry-lifecycle/validate-vehicle-offboarded-registry-event';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { offboardAuditIdempotencyKey } from './offboarding/offboard-registry-audit';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { createVehicleOffboardingServiceForTests } from './testing/vehicle-offboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

function assertVo5cD4D5PgGate(): void {
  if (process.env.VO5C_D4_D5_PG !== '1') {
    throw new Error(
      'VO5C D4/D5 postgres integration requires VO5C_D4_D5_PG=1 (use npm run test:vehicle-onboarding:vo5c-d4-d5:postgres)',
    );
  }
}

function makeFleetStatusService(): VehiclesService {
  const stub = (): unknown => ({});
  return new (VehiclesService as unknown as new (...args: unknown[]) => VehiclesService)(
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
}

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5C-D45 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createActorUser(prisma: PrismaClient, orgId: string) {
  const userId = randomUUID();
  const email = `vo5c-d45-${randomUUID()}@example.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, created_at, updated_at)
    VALUES (${userId}, ${email}, 'VO5C D45 Actor', 'ACTIVE'::"UserStatus", NOW(), NOW())
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

function buildHttpOffboard(prisma: PrismaClient) {
  const offboarding = createVehicleOffboardingServiceForTests(prisma);
  const preflight = new VehicleOffboardPreflightService(prisma as never);
  return new VehicleOnboardingOffboardService(preflight, offboarding);
}

function buildBusinessAuditProcessor(prisma: PrismaClient) {
  return new BusinessAuditOutboxProcessorService(
    prisma as never,
    new BusinessAuditOutboxRepository(prisma as never),
    new AuditService(prisma as never),
    new BusinessAuditOutboxMetricsService(),
  );
}

describe('VO5C D4/D5 consistency (PostgreSQL)', () => {
  assertVo5cD4D5PgGate();

  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const fleetStatus = makeFleetStatusService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('D4: ACTIVE + AVAILABLE keeps rental semantics; OFFBOARDED never projects AVAILABLE', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);

    const activeCtx = fleetStatus.deriveFleetStatusContext({
      vehicle: {
        id: vehicleId,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: 'ACTIVE',
      },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(activeCtx.status).toBe('Available');
    expect(activeCtx.operationalState.status).toBe('AVAILABLE');

    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = await createActorUser(prisma, orgId);
    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId,
      idempotencyKey: randomUUID(),
    });

    const row = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { status: true, registryLifecycle: true },
    });
    expect(row?.status).toBe(VehicleStatus.AVAILABLE);
    expect(row?.registryLifecycle).toBe('OFFBOARDED');

    const offboardedCtx = fleetStatus.deriveFleetStatusContext({
      vehicle: {
        id: vehicleId,
        status: row!.status,
        registryLifecycle: row!.registryLifecycle,
      },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(offboardedCtx.status).toBe('Offboarded');
    expect(offboardedCtx.operationalState.status).not.toBe('AVAILABLE');
    expect(offboardedCtx.operationalState.status).toBe('UNKNOWN');
  });

  it('D5: persists offboard audit note transactionally with billing outbox v2 unchanged', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = await createActorUser(prisma, orgId);
    const idempotencyKey = randomUUID();
    const note = 'Customer sold vehicle — audit trail';

    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId,
      idempotencyKey,
      note,
    });

    const outbox = await prisma.vehicleRegistryLifecycleOutbox.findFirst({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    expect(outbox).toBeTruthy();
    expect(outbox!.payloadVersion).toBe(2);
    const payload = outbox!.payload as Record<string, unknown>;
    expect(payload.note).toBeUndefined();
    expect(() => validateVehicleOffboardedRegistryEvent(outbox!)).not.toThrow();

    const audit = await prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey: offboardAuditIdempotencyKey(idempotencyKey) },
    });
    expect(audit?.action).toBe(BusinessAuditAction.VEHICLE_REGISTRY_OFFBOARDED);
    const auditPayload = audit?.payload as {
      metadata?: { note?: string; reason?: string; vehicleId?: string };
    };
    expect(auditPayload?.metadata?.note).toBe(note);
    expect(auditPayload?.metadata?.reason).toBe('OFFBOARD_SOLD');
    expect(auditPayload?.metadata?.vehicleId).toBe(vehicleId);
  });

  it('D5: business audit outbox row processes to PROCESSED and activity log', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = await createActorUser(prisma, orgId);
    const idempotencyKey = randomUUID();
    const note = 'Processor path verification';

    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId,
      idempotencyKey,
      note,
    });

    const audit = await prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey: offboardAuditIdempotencyKey(idempotencyKey) },
    });
    expect(audit?.status).toBe(BusinessAuditOutboxStatus.PENDING);

    const beforeLogs = await prisma.activityLog.count({
      where: { organizationId: orgId, entityId: vehicleId },
    });

    const processor = buildBusinessAuditProcessor(prisma);
    const outcome = await processor.processOutboxId(audit!.id);
    expect(outcome).toBe('processed');

    const afterRow = await prisma.businessAuditOutbox.findUnique({ where: { id: audit!.id } });
    expect(afterRow?.status).toBe(BusinessAuditOutboxStatus.PROCESSED);

    const afterLogs = await prisma.activityLog.count({
      where: { organizationId: orgId, entityId: vehicleId },
    });
    expect(afterLogs).toBeGreaterThan(beforeLogs);
  });

  it('D5: idempotent retry with same key and note does not duplicate audit or lifecycle outbox', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = await createActorUser(prisma, orgId);
    const idempotencyKey = randomUUID();

    const first = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId,
      idempotencyKey,
      note: 'First note',
    });
    expect(first.idempotentReplay).toBe(false);

    const second = await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId,
      idempotencyKey,
      note: 'First note',
    });
    expect(second.idempotentReplay).toBe(true);

    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
    expect(
      await prisma.businessAuditOutbox.count({
        where: { idempotencyKey: offboardAuditIdempotencyKey(idempotencyKey) },
      }),
    ).toBe(1);
  });

  it('D5: rejects conflicting note on same idempotency key', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = await createActorUser(prisma, orgId);
    const idempotencyKey = randomUUID();

    await httpOffboard.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId,
      idempotencyKey,
      note: 'Original',
    });

    await expect(
      httpOffboard.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId,
        idempotencyKey,
        note: 'Different',
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });
});

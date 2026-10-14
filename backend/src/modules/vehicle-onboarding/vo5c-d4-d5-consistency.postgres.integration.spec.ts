/**
 * VO5C D4/D5 — registry fleet status + durable offboard audit note (PostgreSQL).
 */
import { BusinessAuditAction, BusinessType, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { offboardAuditIdempotencyKey } from './offboarding/offboard-registry-audit';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { createVehicleOffboardingServiceForTests } from './testing/vehicle-offboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run = process.env.VO5C_D4_D5_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5C-D45 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
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
  return vehicleId;
}

function buildHttpOffboard(prisma: PrismaClient) {
  const offboarding = createVehicleOffboardingServiceForTests(prisma);
  const preflight = new VehicleOffboardPreflightService(prisma as never);
  return new VehicleOnboardingOffboardService(preflight, offboarding);
}

(run ? describe : describe.skip)('VO5C D4/D5 consistency (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists offboard audit note transactionally with billing outbox unchanged (v2)', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = randomUUID();
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

  it('idempotent retry with same key and note does not duplicate audit or lifecycle outbox', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = randomUUID();
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

  it('rejects conflicting note on same idempotency key', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createActiveVehicle(prisma, orgId);
    const httpOffboard = buildHttpOffboard(prisma);
    const actorUserId = randomUUID();
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

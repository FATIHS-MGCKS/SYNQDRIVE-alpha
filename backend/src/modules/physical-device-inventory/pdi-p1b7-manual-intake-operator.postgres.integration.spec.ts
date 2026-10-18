/**
 * Operator CLI flow — service + activity audit parity (disposable PostgreSQL).
 */
import {
  ActivityAction,
  ActivityEntity,
  BusinessType,
  PhysicalDeviceModelCode,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  recordPdiP1b7ManualIntakeActivityAudit,
  PDI_P1B7_OPERATOR_CLI_ROUTE,
} from './pdi-p1b7-manual-intake-operator.lib';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

(LIVE ? describe : describe.skip)('PDI P1B.7 operator flow (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: PhysicalDeviceInventoryService;
  let audit: AuditService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
    audit = new AuditService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOrg() {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `PDI op ${id.slice(0, 8)}`,
        businessType: BusinessType.RENTAL,
      },
    });
    return id;
  }

  it('manual intake + activity audit leaves one device and MANUAL_INTAKE domain audit', async () => {
    const orgId = await createOrg();
    const serial = `R1-OP-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = `pdi-op-${randomUUID()}`;
    const actorId = randomUUID();
    const actorEmail = `pdi-flow-${randomUUID().slice(0, 8)}@example.com`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, platform_role, status, created_at, updated_at)
      VALUES (
        ${actorId}::uuid,
        ${actorEmail},
        'PDI flow test master admin',
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        ${UserStatus.ACTIVE}::"UserStatus",
        NOW(),
        NOW()
      )
    `;
    const actor = { id: actorId };

    const first = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'Lager',
        ownerOrganizationId: orgId,
        idempotencyKey,
      },
      actor.id,
    );

    const activityLogId = await recordPdiP1b7ManualIntakeActivityAudit(audit, {
      actorUserId: actor.id,
      operatorAttestation: 'integration test operator attestation',
      result: first,
      executeMode: true,
    });
    expect(activityLogId).toBeTruthy();

    const replay = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'Lager',
        ownerOrganizationId: orgId,
        idempotencyKey,
      },
      actor.id,
    );
    expect(replay.id).toBe(first.id);

    const deviceCount = await prisma.physicalDevice.count({
      where: { ownerOrganizationId: orgId },
    });
    expect(deviceCount).toBe(1);

    const domainAudit = await prisma.physicalDeviceInventoryAuditEvent.findMany({
      where: { physicalDeviceId: first.id },
    });
    expect(domainAudit.some((e) => e.eventKind === 'MANUAL_INTAKE')).toBe(true);

    const activity = await prisma.activityLog.findFirst({
      where: { id: activityLogId! },
    });
    expect(activity?.action).toBe(ActivityAction.CREATE);
    expect(activity?.entity).toBe(ActivityEntity.ADMIN_OPERATION);
    expect(activity?.route).toBe(PDI_P1B7_OPERATOR_CLI_ROUTE);

    await prisma.activityLog.deleteMany({ where: { userId: actor.id } });
    await prisma.user.delete({ where: { id: actor.id } });
    await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: first.id } });
    await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
      where: { physicalDeviceId: first.id },
    });
    await prisma.physicalDevice.delete({ where: { id: first.id } });
    await prisma.organization.delete({ where: { id: orgId } });
  });
});

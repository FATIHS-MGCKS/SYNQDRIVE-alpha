/**
 * PDI P1B.7 Gate C identity verify operator CLI — disposable PostgreSQL.
 */
import type { INestApplicationContext } from '@nestjs/common';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryAuditEventKind,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MASTER_ADMIN_SMOKE_EMAIL } from '@modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.constants';
import {
  PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY,
  recordPdiP1b7IdentityVerifyActivityAudit,
} from './pdi-p1b7-identity-verify-operator.lib';
import {
  createPdiP1b7IdentityVerifyOperatorApplicationContext,
  runPdiP1b7IdentityVerifyOperator,
} from './pdi-p1b7-identity-verify-operator.runner';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  createInactiveSmokeStyleMasterAdmin,
  createOperatorTestMasterAdmin,
  seedPdiP1b7IdentityVerifyOperatorFixtures,
  seedPdiP1b7OperatorPreflightIdentity,
} from './pdi-p1b7-operator-cli.fixture';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const ATTESTATION = 'Owner authorized PDI P1B.7 Gate C identity verify test';

(LIVE ? describe : describe.skip)('PDI P1B.7 Gate C identity verify operator CLI (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let app: INestApplicationContext;
  let masterAdmin: { id: string; email: string };
  const createdUserIds: string[] = [];
  const envSnapshot = { ...process.env };

  beforeAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = 'false';
    masterAdmin = await createOperatorTestMasterAdmin(prisma);
    createdUserIds.push(masterAdmin.id);
    await seedPdiP1b7IdentityVerifyOperatorFixtures(prisma, masterAdmin.id);
    app = await createPdiP1b7IdentityVerifyOperatorApplicationContext({ prisma });
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    const deviceId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId;
    await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
      where: { physicalDeviceId: deviceId },
    });
    await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: deviceId } });
    await prisma.physicalDevice.deleteMany({ where: { id: deviceId } });
    // Ephemeral DB is dropped by CI harness; skip user delete (activity_logs append-only FK).
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
    await prisma.$disconnect();
  });

  async function runOperator(
    input: Parameters<typeof runPdiP1b7IdentityVerifyOperator>[1],
    env: Record<string, string | undefined> = {},
  ) {
    const prev: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(env)) {
      prev[key] = process.env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    const outcome = await runPdiP1b7IdentityVerifyOperator(app, input);
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return outcome;
  }

  async function resetDeviceToNeedsClarification(): Promise<void> {
    const deviceId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId;
    await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
    });
    await prisma.physicalDevice.update({
      where: { id: deviceId },
      data: { identityStatus: PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION },
    });
  }

  it('rejects execute when operator flag is OFF', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED: 'false' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED/i);
    }
  });

  it('rejects missing master admin actor', async () => {
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/actor/i);
    }
  });

  it('rejects inactive master admin actor', async () => {
    const inactive = await createInactiveSmokeStyleMasterAdmin(prisma);
    createdUserIds.push(inactive.id);
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: inactive.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/not ACTIVE/i);
    }
  });

  it('rejects master-admin smoke acceptance email', async () => {
    const smokeId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, platform_role, status, created_at, updated_at)
      VALUES (
        ${smokeId}::uuid,
        ${MASTER_ADMIN_SMOKE_EMAIL},
        'Smoke acceptance',
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        ${UserStatus.ACTIVE}::"UserStatus",
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        platform_role = EXCLUDED.platform_role,
        status = EXCLUDED.status
    `;
    const smoke = await prisma.user.findUniqueOrThrow({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
      select: { id: true },
    });
    createdUserIds.push(smoke.id);
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: MASTER_ADMIN_SMOKE_EMAIL,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/smoke acceptance account/i);
    }
  });

  it('dry-run succeeds without identity mutation', async () => {
    const deviceId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId;
    const before = await prisma.physicalDevice.findUniqueOrThrow({
      where: { id: deviceId },
      select: { identityStatus: true },
    });
    const verifyAuditsBefore = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
    });
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.stdout).toMatch(/"mode": "dry-run"/);
      expect(outcome.exitCode).toBe(0);
    }
    const after = await prisma.physicalDevice.findUniqueOrThrow({
      where: { id: deviceId },
      select: { identityStatus: true },
    });
    expect(after.identityStatus).toBe(before.identityStatus);
    const verifyAuditsAfter = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
    });
    expect(verifyAuditsAfter).toBe(verifyAuditsBefore);
  });

  it('dry-run fails when DIMO serial mismatches authorized scope', async () => {
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = jsonb_set(raw_json, '{aftermarketDevice,serial}', '"WRONG-SERIAL"')
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken}
    `;
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(2);
      expect(outcome.stderr).toMatch(/DIMO_SERIAL_MISMATCH|blocking reasons/i);
    }
    await seedPdiP1b7OperatorPreflightIdentity(prisma);
  });

  it('dry-run fails when DIMO raw_json serial evidence is missing', async () => {
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = raw_json - 'aftermarketDevice'
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken}
    `;
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(2);
      expect(outcome.stderr).toMatch(/DIMO_SERIAL_MISSING|blocking reasons/i);
    }
    await seedPdiP1b7OperatorPreflightIdentity(prisma);
  });

  it('rejects execute without confirmation flag', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/confirm-p1b7-identity-verify/i);
    }
  });

  it('verifies identity, records audits, and does not install on vehicle', async () => {
    await resetDeviceToNeedsClarification();
    const deviceId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId;
    const installBefore = await prisma.physicalDeviceAssignment.count({
      where: {
        physicalDeviceId: deviceId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        vehicleId: { not: null },
      },
    });
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count();

    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toMatch(/"identityStatus": "VERIFIED"/);
    }

    const device = await prisma.physicalDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.identityStatus).toBe(PhysicalDeviceIdentityStatus.VERIFIED);

    const domainAudit = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
        idempotencyKey: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey,
      },
    });
    expect(domainAudit).not.toBeNull();
    const evidence = domainAudit!.evidenceJson as Record<string, unknown>;
    expect(evidence.provesPhysicalInstall).toBe(false);

    const activity = await prisma.activityLog.findFirst({
      where: {
        route: { contains: 'pdi-p1b7-identity-verify-operator' },
        userId: masterAdmin.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(activity).not.toBeNull();

    const installAfter = await prisma.physicalDeviceAssignment.count({
      where: {
        physicalDeviceId: deviceId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        vehicleId: { not: null },
      },
    });
    expect(installAfter).toBe(installBefore);
    const outboxAfter = await prisma.vehicleRegistryLifecycleOutbox.count();
    expect(outboxAfter).toBe(outboxBefore);
  });

  it('replays execute with same idempotency key without duplicate domain audit', async () => {
    const deviceId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId;
    const auditsBefore = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
    });
    expect(auditsBefore).toBeGreaterThanOrEqual(1);

    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(true);
    const auditsAfter = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
    });
    expect(auditsAfter).toBe(auditsBefore);
  });

  it('reports partial success when activity audit fails after domain commit', async () => {
    const service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
    const audit = new AuditService(prisma as unknown as PrismaService);
    const recordSpy = jest.spyOn(audit, 'record').mockResolvedValue(null);
    const device = await service.getDeviceDetail(PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId);
    const activityLogId = await recordPdiP1b7IdentityVerifyActivityAudit(audit, {
      actorUserId: masterAdmin.id,
      operatorAttestation: ATTESTATION,
      result: {
        id: device.id,
        internalInventoryNumber: device.internalInventoryNumber,
        manufacturer: device.manufacturer,
        modelCode: device.modelCode,
        serialNumberMasked: device.serialNumberMasked,
        imeiMasked: device.imeiMasked,
        ownerOrganizationId: device.ownerOrganizationId,
        warehouseLocation: device.warehouseLocation,
        status: device.status,
        identityStatus: device.identityStatus,
        recordedAt: device.recordedAt,
        currentVehicleId: device.currentVehicleId,
        installEligible: device.installEligible,
      },
      executeMode: true,
    });
    expect(activityLogId).toBeNull();
    recordSpy.mockRestore();
  });
});

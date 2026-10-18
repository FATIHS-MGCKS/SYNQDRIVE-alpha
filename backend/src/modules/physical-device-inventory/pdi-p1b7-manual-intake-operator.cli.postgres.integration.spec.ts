/**
 * PDI P1B.7 operator CLI — disposable PostgreSQL (Nest application context + shared runner).
 */
import type { INestApplicationContext } from '@nestjs/common';
import {
  BusinessType,
  PhysicalDeviceModelCode,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MASTER_ADMIN_SMOKE_EMAIL } from '@modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.constants';
import {
  PDI_P1B7_AUTHORIZED_INTAKE,
  recordPdiP1b7ManualIntakeActivityAudit,
} from './pdi-p1b7-manual-intake-operator.lib';
import {
  createPdiP1b7OperatorApplicationContext,
  runPdiP1b7ManualIntakeOperator,
} from './pdi-p1b7-manual-intake-operator.runner';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  createInactiveSmokeStyleMasterAdmin,
  createOperatorTestMasterAdmin,
  seedPdiP1b7OperatorPreflightIdentity,
} from './pdi-p1b7-operator-cli.fixture';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const ATTESTATION = 'Owner authorized PDI P1B.7 Gate B test';

(LIVE ? describe : describe.skip)('PDI P1B.7 operator CLI (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let app: INestApplicationContext;
  let masterAdmin: { id: string; email: string };
  const createdUserIds: string[] = [];
  const envSnapshot = { ...process.env };

  beforeAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    await seedPdiP1b7OperatorPreflightIdentity(prisma);
    masterAdmin = await createOperatorTestMasterAdmin(prisma);
    createdUserIds.push(masterAdmin.id);
    app = await createPdiP1b7OperatorApplicationContext({ prisma });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma.physicalDeviceAssignment.deleteMany({
      where: { idempotencyKey: PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey },
    });
    const devices = await prisma.physicalDevice.findMany({
      where: {
        serialNumber: {
          equals: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber,
          mode: 'insensitive',
        },
      },
    });
    for (const device of devices) {
      await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
        where: { physicalDeviceId: device.id },
      });
      await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: device.id } });
      await prisma.physicalDevice.delete({ where: { id: device.id } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
    await prisma.$disconnect();
  });

  async function runOperator(
    input: Parameters<typeof runPdiP1b7ManualIntakeOperator>[1],
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
    const outcome = await runPdiP1b7ManualIntakeOperator(app, input);
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return outcome;
  }

  it('rejects execute when operator flag is OFF', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED: 'false' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED/i);
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

  it('rejects non-master-admin actor', async () => {
    const userId = randomUUID();
    const userEmail = `pdi-user-${randomUUID().slice(0, 8)}@example.com`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, platform_role, status, created_at, updated_at)
      VALUES (
        ${userId}::uuid,
        ${userEmail},
        'PDI non-admin test user',
        ${UserPlatformRole.USER}::"UserPlatformRole",
        ${UserStatus.ACTIVE}::"UserStatus",
        NOW(),
        NOW()
      )
    `;
    createdUserIds.push(userId);
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: userEmail,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/MASTER_ADMIN/i);
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

  it('dry-run succeeds without inventory mutation', async () => {
    const before = await prisma.physicalDevice.count({
      where: {
        serialNumber: {
          equals: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber,
          mode: 'insensitive',
        },
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
    const after = await prisma.physicalDevice.count({
      where: {
        serialNumber: {
          equals: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber,
          mode: 'insensitive',
        },
      },
    });
    expect(after).toBe(before);
  });

  it('rejects execute without confirmation flag', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/confirm-p1b7-manual-intake/i);
    }
  });

  it('dry-run fails when DIMO serial mismatches authorized scope', async () => {
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = jsonb_set(raw_json, '{aftermarketDevice,serial}', '"WRONG-SERIAL"')
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_INTAKE.dimoToken}
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

  it('reports partial success when activity audit fails after domain commit', async () => {
    const service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
    const audit = new AuditService(prisma as unknown as PrismaService);
    const serial = `R1-PARTIAL-${randomUUID().slice(0, 8)}`;
    const orgId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'partial', businessType: BusinessType.RENTAL },
    });
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'Lager',
        ownerOrganizationId: orgId,
      },
      masterAdmin.id,
    );
    const recordSpy = jest.spyOn(audit, 'record').mockResolvedValue(null);
    const activityLogId = await recordPdiP1b7ManualIntakeActivityAudit(audit, {
      actorUserId: masterAdmin.id,
      operatorAttestation: ATTESTATION,
      result: device,
      executeMode: true,
    });
    expect(activityLogId).toBeNull();
    const count = await prisma.physicalDevice.count({ where: { id: device.id } });
    expect(count).toBe(1);
    recordSpy.mockRestore();
    await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: device.id } });
    await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
      where: { physicalDeviceId: device.id },
    });
    await prisma.physicalDevice.delete({ where: { id: device.id } });
    await prisma.organization.delete({ where: { id: orgId } });
  });
});

/**
 * PDI P1B.7 operator CLI — disposable PostgreSQL (subprocess + Nest context paths).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BusinessType,
  PhysicalDeviceModelCode,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { MASTER_ADMIN_SMOKE_EMAIL } from '@modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.constants';
import {
  PDI_P1B7_AUTHORIZED_INTAKE,
  recordPdiP1b7ManualIntakeActivityAudit,
} from './pdi-p1b7-manual-intake-operator.lib';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  createInactiveSmokeStyleMasterAdmin,
  createOperatorTestMasterAdmin,
  seedPdiP1b7OperatorPreflightIdentity,
} from './pdi-p1b7-operator-cli.fixture';

const execFileAsync = promisify(execFile);

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const BACKEND_ROOT = resolve(__dirname, '../../..');
const CLI_SCRIPT = join(BACKEND_ROOT, 'scripts/ops/pdi-p1b7-manual-intake-operator.ts');

async function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const baseEnv = {
    ...process.env,
    ...env,
    PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED: 'true',
  };
  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      ['ts-node', '-r', 'tsconfig-paths/register', CLI_SCRIPT, ...args],
      {
        cwd: BACKEND_ROOT,
        env: baseEnv as NodeJS.ProcessEnv,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

(LIVE ? describe : describe.skip)('PDI P1B.7 operator CLI (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let masterAdmin: { id: string; email: string };
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await seedPdiP1b7OperatorPreflightIdentity(prisma);
    masterAdmin = await createOperatorTestMasterAdmin(prisma);
    createdUserIds.push(masterAdmin.id);
  });

  afterAll(async () => {
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
    await prisma.$disconnect();
  });

  it('rejects execute when operator flag is OFF', async () => {
    const result = await runCli(
      [
        '--execute',
        '--confirm-p1b7-manual-intake',
        `--actor-email=${masterAdmin.email}`,
        '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
      ],
      { PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED: 'false' },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED/i);
  });

  it('rejects missing master admin actor', async () => {
    const result = await runCli(['--operator-attestation=Owner authorized PDI P1B.7 Gate B test']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/actor/i);
  });

  it('rejects non-master-admin actor', async () => {
    const user = await prisma.user.create({
      data: {
        email: `pdi-user-${randomUUID().slice(0, 8)}@example.com`,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    createdUserIds.push(user.id);
    const result = await runCli([
      `--actor-email=${user.email}`,
      '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/MASTER_ADMIN/i);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects inactive master admin actor', async () => {
    const inactive = await createInactiveSmokeStyleMasterAdmin(prisma);
    createdUserIds.push(inactive.id);
    const result = await runCli([
      `--actor-email=${inactive.email}`,
      '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not ACTIVE/i);
  });

  it('rejects master-admin smoke acceptance email', async () => {
    const smoke = await prisma.user.upsert({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
      create: {
        email: MASTER_ADMIN_SMOKE_EMAIL,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      update: {
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdUserIds.push(smoke.id);
    const result = await runCli([
      `--actor-email=${MASTER_ADMIN_SMOKE_EMAIL}`,
      '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/smoke acceptance account/i);
    await prisma.user.delete({ where: { id: smoke.id } });
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
    const result = await runCli([
      `--actor-email=${masterAdmin.email}`,
      '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/"mode": "dry-run"/);
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
    const result = await runCli(
      [
        '--execute',
        `--actor-email=${masterAdmin.email}`,
        '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
      ],
      { PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED: 'true' },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/confirm-p1b7-manual-intake/i);
  });

  it('dry-run fails when DIMO serial mismatches authorized scope', async () => {
    // Temporarily break identity by updating token 192922 serial in raw json
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = jsonb_set(raw_json, '{aftermarketDevice,serial}', '"WRONG-SERIAL"')
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_INTAKE.dimoToken}
    `;
    const result = await runCli([
      `--actor-email=${masterAdmin.email}`,
      '--operator-attestation=Owner authorized PDI P1B.7 Gate B test',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/DIMO_SERIAL_MISMATCH|blocking reasons/i);
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
      operatorAttestation: 'Owner authorized PDI P1B.7 Gate B test',
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

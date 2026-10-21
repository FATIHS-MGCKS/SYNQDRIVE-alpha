/**
 * PDI P1B.2 uninstall operator CLI — disposable PostgreSQL.
 */
import type { INestApplicationContext } from '@nestjs/common';
import {
  BusinessType,
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceModelCode,
  PrismaClient,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  createPdiP1b2UninstallOperatorApplicationContext,
  runPdiP1b2UninstallOperator,
} from './pdi-p1b2-uninstall-operator.runner';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { createOperatorTestMasterAdmin } from './pdi-p1b7-operator-cli.fixture';
import { PhysicalDeviceUninstallCondition } from './dto/uninstall-physical-device.dto';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const ATTESTATION =
  'Owner authorized physical removal of Ruptela device from vehicle for P1B.2 pilot test';

(LIVE ? describe : describe.skip)('PDI P1B.2 uninstall operator CLI (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let app: INestApplicationContext;
  let service: PhysicalDeviceInventoryService;
  let masterAdmin: { id: string; email: string };

  beforeAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = 'true';
    masterAdmin = await createOperatorTestMasterAdmin(prisma);
    service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
    app = await createPdiP1b2UninstallOperatorApplicationContext({ prisma });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  async function seedInstalledDevice() {
    const orgId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: `PDI P1B2 op ${orgId.slice(0, 6)}`, businessType: BusinessType.RENTAL },
    });
    const vehicleId = randomUUID();
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId: orgId,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: 'GASOLINE',
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    const serial = `R1-OP-${randomUUID().slice(0, 8)}`;
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-OP',
        ownerOrganizationId: orgId,
      },
      masterAdmin.id,
    );
    await prisma.physicalDevice.update({
      where: { id: device.id },
      data: { identityStatus: 'VERIFIED' },
    });
    const installed = await service.installOnVehicle(
      device.id,
      { vehicleId, installConfirmation: true, idempotencyKey: `install-${randomUUID()}` },
      masterAdmin.id,
    );
    const assignment = await prisma.physicalDeviceAssignment.findFirst({
      where: {
        physicalDeviceId: installed.id,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        effectiveTo: null,
      },
    });
    return {
      deviceId: installed.id,
      vehicleId,
      assignmentId: assignment!.id,
      orgId,
    };
  }

  async function runOperator(
    scope: {
      physicalDeviceId: string;
      vehicleId: string;
      assignmentId: string;
      idempotencyKey: string;
      uninstallReason: string;
    },
    execute: boolean,
    env: Record<string, string> = {},
  ) {
    const prev: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries({
      PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL: 'true',
      ...env,
    })) {
      prev[key] = process.env[key];
      process.env[key] = value;
    }
    const outcome = await runPdiP1b2UninstallOperator(app, {
      execute,
      confirmFlag: execute,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
      scope: { ...scope, uninstallReason: scope.uninstallReason || 'Physical removal' },
    });
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return outcome;
  }

  it('dry-run does not mutate device status', async () => {
    const { deviceId, vehicleId, assignmentId } = await seedInstalledDevice();
    const idempotencyKey = `dry-${randomUUID()}`;
    const before = await prisma.physicalDevice.findUnique({ where: { id: deviceId } });
    const outcome = await runOperator(
      {
        physicalDeviceId: deviceId,
        vehicleId,
        assignmentId,
        idempotencyKey,
        uninstallReason: 'dry run',
      },
      false,
    );
    expect(outcome.ok).toBe(true);
    const after = await prisma.physicalDevice.findUnique({ where: { id: deviceId } });
    expect(after?.status).toBe(before?.status);
    if (outcome.ok) {
      expect(outcome.stdout).toMatch(/"mode": "dry-run"/);
    }
  });

  it('execute moves device to PENDING_RETURN with idempotency replay', async () => {
    const { deviceId, vehicleId, assignmentId } = await seedInstalledDevice();
    const idempotencyKey = `exec-${randomUUID()}`;
    const scope = {
      physicalDeviceId: deviceId,
      vehicleId,
      assignmentId,
      idempotencyKey,
      uninstallReason: 'Workshop removal',
    };
    const first = await runOperator(scope, true, {
      PDI_P1B2_UNINSTALL_OPERATOR_ENABLED: 'true',
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.exitCode).toBe(0);

    const device = await prisma.physicalDevice.findUnique({ where: { id: deviceId } });
    expect(device?.status).toBe('PENDING_RETURN');

    const second = await runOperator(scope, true, {
      PDI_P1B2_UNINSTALL_OPERATOR_ENABLED: 'true',
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.stdout).toMatch(/"idempotentReplay": true/);
    }

    const auditCount = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: { physicalDeviceId: deviceId, eventKind: 'UNINSTALL', idempotencyKey },
    });
    expect(auditCount).toBe(1);
  });

  it('rejects idempotency key reused on different device', async () => {
    const a = await seedInstalledDevice();
    const b = await seedInstalledDevice();
    const sharedKey = `shared-${randomUUID()}`;
    await runOperator(
      {
        physicalDeviceId: a.deviceId,
        vehicleId: a.vehicleId,
        assignmentId: a.assignmentId,
        idempotencyKey: sharedKey,
        uninstallReason: 'once',
      },
      true,
      { PDI_P1B2_UNINSTALL_OPERATOR_ENABLED: 'true' },
    );
    const blocked = await runOperator(
      {
        physicalDeviceId: b.deviceId,
        vehicleId: b.vehicleId,
        assignmentId: b.assignmentId,
        idempotencyKey: sharedKey,
        uninstallReason: 'twice',
      },
      false,
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.stderr).toMatch(/IDEMPOTENCY_KEY_USED_ON_OTHER_DEVICE|Preflight failed/);
    }
  });
});

/**
 * PDI P1B.7 Gate D install operator CLI — disposable PostgreSQL.
 */
import type { INestApplicationContext } from '@nestjs/common';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MASTER_ADMIN_SMOKE_EMAIL } from '@modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.constants';
import {
  PDI_P1B7_AUTHORIZED_INSTALL,
  physicalDeviceDetailToListItem,
  reconcilePdiP1b7InstallDomainCommit,
} from './pdi-p1b7-install-operator.lib';
import {
  createPdiP1b7InstallOperatorApplicationContext,
  runPdiP1b7InstallOperator,
} from './pdi-p1b7-install-operator.runner';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  createInactiveSmokeStyleMasterAdmin,
  createOperatorTestMasterAdmin,
  resetPdiP1b7GateDInstallState,
  seedAuthorizedGateDIdempotencyAssignment,
  seedAuthorizedGateDInstallDomainAudit,
  seedPdiP1b7InstallOperatorFixtures,
  seedPdiP1b7OperatorPreflightIdentity,
} from './pdi-p1b7-operator-cli.fixture';
import { buildInstallPayloadFingerprint } from './physical-device-install.fingerprint';
import { buildPdiP1b7InstallDto } from './pdi-p1b7-install-operator.lib';
import { PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH } from './physical-device-inventory.errors';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const ATTESTATION = 'Owner authorized PDI P1B.7 Gate D install test';

(LIVE ? describe : describe.skip)('PDI P1B.7 Gate D install operator CLI (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let app: INestApplicationContext;
  let masterAdmin: { id: string; email: string };
  const envSnapshot = { ...process.env };

  beforeAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = 'false';
    masterAdmin = await createOperatorTestMasterAdmin(prisma);
    await seedPdiP1b7InstallOperatorFixtures(prisma, masterAdmin.id);
    app = await createPdiP1b7InstallOperatorApplicationContext({ prisma });
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
    await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
      where: { physicalDeviceId: deviceId },
    });
    await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: deviceId } });
    await prisma.physicalDevice.deleteMany({ where: { id: deviceId } });
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
    await prisma.$disconnect();
  });

  async function runOperator(
    input: Parameters<typeof runPdiP1b7InstallOperator>[1],
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
    const outcome = await runPdiP1b7InstallOperator(app, input);
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return outcome;
  }

  beforeEach(async () => {
    await resetPdiP1b7GateDInstallState(prisma);
  });

  it('rejects execute when operator flag is OFF', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'false' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/PDI_P1B7_INSTALL_OPERATOR_ENABLED/i);
    }
  });

  it('rejects execute without confirmation flag', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/confirm-p1b7-install/i);
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

  it('dry-run succeeds without install mutation', async () => {
    const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
    const installBefore = await prisma.physicalDeviceAssignment.count({
      where: { physicalDeviceId: deviceId, assignmentKind: PhysicalDeviceAssignmentKind.INSTALL },
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
    const installAfter = await prisma.physicalDeviceAssignment.count({
      where: { physicalDeviceId: deviceId, assignmentKind: PhysicalDeviceAssignmentKind.INSTALL },
    });
    expect(installAfter).toBe(installBefore);
  });

  it('dry-run fails when identity is not VERIFIED', async () => {
    await prisma.physicalDevice.update({
      where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
      data: { identityStatus: PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION },
    });
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(2);
      expect(outcome.stderr).toMatch(/IDENTITY_NOT_VERIFIED|blocking reasons/i);
    }
    await prisma.physicalDevice.update({
      where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
      data: { identityStatus: PhysicalDeviceIdentityStatus.VERIFIED },
    });
  });

  it('dry-run fails when DIMO serial mismatches', async () => {
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = jsonb_set(raw_json, '{aftermarketDevice,serial}', '"WRONG-SERIAL"')
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_INSTALL.dimoToken}
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
    }
    await seedPdiP1b7OperatorPreflightIdentity(prisma);
  });

  it('dry-run fails when vehicle registry is not ACTIVE', async () => {
    await prisma.vehicle.update({
      where: { id: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId },
      data: { registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED },
    });
    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(2);
      expect(outcome.stderr).toMatch(/REGISTRY_OFFBOARDED|blocking reasons/i);
    }
    await prisma.vehicle.update({
      where: { id: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId },
      data: { registryLifecycle: VehicleRegistryLifecycle.ACTIVE },
    });
  });

  it('rejects execute when P1B1 writes are OFF', async () => {
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      {
        PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true',
        PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED: 'false',
      },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/P1B1_WRITES_ENABLED/i);
    }
  });

  it('installs with P1B2 OFF, persists notes, audits, and does not mutate DIMO/VO/VDC', async () => {
    const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count();
    const linksBefore = await prisma.vehicleDataSourceLink.count({
      where: { vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId, provider: 'DIMO' },
    });

    const beforeMs = Date.now();
    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true', PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED: 'false' },
    );
    const afterMs = Date.now();

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toMatch(/"status": "INSTALLED"/);
      expect(outcome.stdout).toMatch(/"identityStatus": "VERIFIED"/);
    }

    const device = await prisma.physicalDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.status).toBe(PhysicalDeviceInventoryStatus.INSTALLED);
    expect(device.identityStatus).toBe(PhysicalDeviceIdentityStatus.VERIFIED);

    const installs = await prisma.physicalDeviceAssignment.findMany({
      where: {
        physicalDeviceId: deviceId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        effectiveTo: null,
      },
    });
    expect(installs).toHaveLength(1);
    expect(installs[0].idempotencyKey).toBe(PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey);
    const meta = installs[0].metadataJson as Record<string, unknown>;
    expect(meta.installNotes).toBe(PDI_P1B7_AUTHORIZED_INSTALL.installNotes);
    expect(installs[0].effectiveFrom.getTime()).toBeGreaterThanOrEqual(beforeMs - 2000);
    expect(installs[0].effectiveFrom.getTime()).toBeLessThanOrEqual(afterMs + 2000);

    const domainAudit = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(domainAudit).not.toBeNull();
    const evidence = domainAudit!.evidenceJson as Record<string, unknown>;
    expect(evidence.installNotes).toBe(PDI_P1B7_AUTHORIZED_INSTALL.installNotes);
    expect(evidence.providerBindingMutated).toBe(false);
    expect(evidence.vehicleDataSourceLinksMutated).toBe(false);

    const activity = await prisma.activityLog.findFirst({
      where: {
        route: { contains: 'pdi-p1b7-install-operator' },
        userId: masterAdmin.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(activity).not.toBeNull();

    const outboxAfter = await prisma.vehicleRegistryLifecycleOutbox.count();
    expect(outboxAfter).toBe(outboxBefore);
    const linksAfter = await prisma.vehicleDataSourceLink.count({
      where: { vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId, provider: 'DIMO' },
    });
    expect(linksAfter).toBe(linksBefore);
  });

  it('replays execute with same idempotency key without duplicate INSTALL assignment', async () => {
    const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
    const first = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
    );
    expect(first.ok).toBe(true);

    const assignmentsBefore = await prisma.physicalDeviceAssignment.count({
      where: {
        physicalDeviceId: deviceId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
      },
    });
    const auditsBefore = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
      },
    });

    const second = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.stdout).toMatch(/"idempotentReplay": true/);
    }

    const assignmentsAfter = await prisma.physicalDeviceAssignment.count({
      where: {
        physicalDeviceId: deviceId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
      },
    });
    const auditsAfter = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
      },
    });
    expect(assignmentsAfter).toBe(assignmentsBefore);
    expect(auditsAfter).toBe(auditsBefore);
  });

  it('service rejects install idempotency key bound to another device', async () => {
    const service = app.get(PhysicalDeviceInventoryService);
    const otherDeviceId = randomUUID();
    await prisma.physicalDevice.create({
      data: {
        id: otherDeviceId,
        internalInventoryNumber: `PDI-OTHER-${otherDeviceId.slice(0, 8)}`,
        manufacturer: 'Ruptela',
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: `R1-OTHER-${randomUUID().slice(0, 8)}`,
        ownerOrganizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        warehouseLocation: 'WH',
        status: PhysicalDeviceInventoryStatus.AVAILABLE,
        identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
        recordedAt: new Date(),
        intakeSource: 'MANUAL_MASTER_ADMIN',
      },
    });

    await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
    );

    await expect(
      service.installOnVehicle(
        otherDeviceId,
        {
          vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
          installConfirmation: true,
          idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
        },
        masterAdmin.id,
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH },
    });

    await prisma.physicalDevice.deleteMany({ where: { id: otherDeviceId } });
  });

  it('blocks dry-run when target vehicle already has another active PDI install', async () => {
    const otherDeviceId = randomUUID();
    await prisma.physicalDevice.create({
      data: {
        id: otherDeviceId,
        internalInventoryNumber: `PDI-OCC-${otherDeviceId.slice(0, 8)}`,
        manufacturer: 'Ruptela',
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: `R1-OCC-${randomUUID().slice(0, 8)}`,
        ownerOrganizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        warehouseLocation: 'WH',
        status: PhysicalDeviceInventoryStatus.INSTALLED,
        identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
        recordedAt: new Date(),
        intakeSource: 'MANUAL_MASTER_ADMIN',
      },
    });
    await prisma.physicalDeviceAssignment.create({
      data: {
        physicalDeviceId: otherDeviceId,
        organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        effectiveFrom: new Date(),
        idempotencyKey: `other-install-${randomUUID()}`,
        actorUserId: masterAdmin.id,
      },
    });

    const outcome = await runOperator({
      execute: false,
      confirmFlag: false,
      actorEmail: masterAdmin.email,
      operatorAttestation: ATTESTATION,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/VEHICLE_PDI_INSTALL_OCCUPIED|blocking reasons/i);
    }

    await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: otherDeviceId } });
    await prisma.physicalDevice.deleteMany({ where: { id: otherDeviceId } });
  });

  it('blocks execute when device is already installed without idempotent replay key', async () => {
    await prisma.physicalDevice.update({
      where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
      data: { status: PhysicalDeviceInventoryStatus.INSTALLED },
    });
    await prisma.physicalDeviceAssignment.create({
      data: {
        physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
        organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        effectiveFrom: new Date(),
        idempotencyKey: `foreign-key-${randomUUID()}`,
        actorUserId: masterAdmin.id,
      },
    });

    const outcome = await runOperator(
      {
        execute: true,
        confirmFlag: true,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      },
      { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stderr).toMatch(/Preflight failed|CONFLICTING|STATUS_INSTALLED/i);
    }
  });

  describe('idempotent replay hardening', () => {
    it('blocks when idempotency assignment has effectiveTo set', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        effectiveTo: new Date(),
        deviceStatus: PhysicalDeviceInventoryStatus.AVAILABLE,
      });
      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(/IDEMPOTENCY_ASSIGNMENT_NOT_ACTIVE|blocking reasons/i);
      }
    });

    it('blocks when device status is AVAILABLE but idempotency row exists', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        deviceStatus: PhysicalDeviceInventoryStatus.AVAILABLE,
      });
      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(
          /IDEMPOTENCY_DEVICE_STATUS_INCONSISTENT|blocking reasons/i,
        );
      }
    });

    it('blocks when payload fingerprint is missing on idempotency assignment', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        omitFingerprint: true,
      });
      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(/IDEMPOTENCY_FINGERPRINT_MISSING|blocking reasons/i);
      }
    });

    it('blocks when payload fingerprint does not match authorized install DTO', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        payloadFingerprint: 'deadbeef',
      });
      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(/IDEMPOTENCY_FINGERPRINT_MISMATCH|blocking reasons/i);
      }
    });

    it('blocks when idempotency key is bound to another device', async () => {
      const otherDeviceId = randomUUID();
      await prisma.physicalDevice.create({
        data: {
          id: otherDeviceId,
          internalInventoryNumber: `PDI-FKEY-${otherDeviceId.slice(0, 8)}`,
          manufacturer: 'Ruptela',
          modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
          serialNumber: `R1-FKEY-${randomUUID().slice(0, 8)}`,
          ownerOrganizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
          warehouseLocation: 'WH',
          status: PhysicalDeviceInventoryStatus.INSTALLED,
          identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
          recordedAt: new Date(),
          intakeSource: 'MANUAL_MASTER_ADMIN',
        },
      });
      const dto = buildPdiP1b7InstallDto();
      const fp = buildInstallPayloadFingerprint(
        PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
        dto,
      );
      await prisma.physicalDeviceAssignment.create({
        data: {
          physicalDeviceId: otherDeviceId,
          organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
          vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
          assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
          effectiveFrom: new Date(),
          idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
          actorUserId: masterAdmin.id,
          metadataJson: { payloadFingerprint: fp },
        },
      });

      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(/IDEMPOTENCY_KEY_DEVICE_MISMATCH|blocking reasons/i);
      }

      await prisma.physicalDeviceAssignment.deleteMany({ where: { physicalDeviceId: otherDeviceId } });
      await prisma.physicalDevice.deleteMany({ where: { id: otherDeviceId } });
    });

    it('blocks when idempotency assignment targets a different vehicle', async () => {
      const otherVehicleId = randomUUID();
      await prisma.vehicle.create({
        data: {
          id: otherVehicleId,
          organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
          make: 'VW',
          model: 'Other',
          year: 2022,
          fuelType: 'GASOLINE',
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        },
      });
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        vehicleId: otherVehicleId,
      });
      const outcome = await runOperator({
        execute: false,
        confirmFlag: false,
        actorEmail: masterAdmin.email,
        operatorAttestation: ATTESTATION,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.stderr).toMatch(/IDEMPOTENCY_KEY_VEHICLE_MISMATCH|blocking reasons/i);
      }
      await prisma.vehicle.deleteMany({ where: { id: otherVehicleId } });
    });

    it('allows valid replay execute without duplicate INSTALL domain audit', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id);
      await seedAuthorizedGateDInstallDomainAudit(prisma, masterAdmin.id);
      const auditsBefore = await prisma.physicalDeviceInventoryAuditEvent.count({
        where: {
          physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
          eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
        },
      });
      const outcome = await runOperator(
        {
          execute: true,
          confirmFlag: true,
          actorEmail: masterAdmin.email,
          operatorAttestation: ATTESTATION,
        },
        { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.exitCode).toBe(0);
        expect(outcome.stdout).toMatch(/"idempotentReplay": true/);
        expect(outcome.stdout).toMatch(/"domainCommitStatus": "COMMITTED"/);
      }
      const auditsAfter = await prisma.physicalDeviceInventoryAuditEvent.count({
        where: {
          physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
          eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
        },
      });
      expect(auditsAfter).toBe(auditsBefore);
    });
  });

  describe('read-only domain commit reconciliation', () => {
    it('detects committed install without calling installOnVehicle', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id);
      await seedAuthorizedGateDInstallDomainAudit(prisma, masterAdmin.id);
      const service = app.get(PhysicalDeviceInventoryService);
      const installSpy = jest.spyOn(service, 'installOnVehicle');
      const createAssignSpy = jest.spyOn(prisma.physicalDeviceAssignment, 'create');
      const updateAssignSpy = jest.spyOn(prisma.physicalDeviceAssignment, 'update');
      const deleteAssignSpy = jest.spyOn(prisma.physicalDeviceAssignment, 'delete');
      const createAuditSpy = jest.spyOn(prisma.physicalDeviceInventoryAuditEvent, 'create');

      const outcome = await reconcilePdiP1b7InstallDomainCommit(prisma, async (id) =>
        physicalDeviceDetailToListItem(await service.getDeviceDetail(id)),
      );

      expect(outcome.status).toBe('COMMITTED');
      expect(installSpy).not.toHaveBeenCalled();
      expect(createAssignSpy).not.toHaveBeenCalled();
      expect(updateAssignSpy).not.toHaveBeenCalled();
      expect(deleteAssignSpy).not.toHaveBeenCalled();
      expect(createAuditSpy).not.toHaveBeenCalled();

      installSpy.mockRestore();
      createAssignSpy.mockRestore();
      updateAssignSpy.mockRestore();
      deleteAssignSpy.mockRestore();
      createAuditSpy.mockRestore();
    });

    it('returns RECONCILIATION_REQUIRED when INSTALL domain audit is missing', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id);
      const service = app.get(PhysicalDeviceInventoryService);
      const outcome = await reconcilePdiP1b7InstallDomainCommit(prisma, async (id) =>
        physicalDeviceDetailToListItem(await service.getDeviceDetail(id)),
      );
      expect(outcome.status).toBe('RECONCILIATION_REQUIRED');
      if (outcome.status === 'RECONCILIATION_REQUIRED') {
        expect(outcome.reasons).toContain('INSTALL_DOMAIN_AUDIT_MISSING');
      }
    });

    it('returns RECONCILIATION_REQUIRED for inconsistent assignment fingerprint', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id, {
        payloadFingerprint: 'inconsistent-fingerprint',
      });
      await seedAuthorizedGateDInstallDomainAudit(prisma, masterAdmin.id);
      const service = app.get(PhysicalDeviceInventoryService);
      const outcome = await reconcilePdiP1b7InstallDomainCommit(prisma, async (id) =>
        physicalDeviceDetailToListItem(await service.getDeviceDetail(id)),
      );
      expect(outcome.status).toBe('RECONCILIATION_REQUIRED');
    });

    it('returns UNKNOWN (not NOT_COMMITTED) when domain evidence read fails', async () => {
      const service = app.get(PhysicalDeviceInventoryService);
      const findManySpy = jest
        .spyOn(prisma.physicalDeviceInventoryAuditEvent, 'findMany')
        .mockRejectedValue(new Error('connection reset'));
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id);
      const outcome = await reconcilePdiP1b7InstallDomainCommit(prisma, async (id) =>
        physicalDeviceDetailToListItem(await service.getDeviceDetail(id)),
      );
      findManySpy.mockRestore();
      expect(outcome.status).toBe('UNKNOWN');
      expect(outcome.status).not.toBe('NOT_COMMITTED');
    });

    it('recovers COMMITTED via read-only reconciliation when installOnVehicle throws once', async () => {
      await seedAuthorizedGateDIdempotencyAssignment(prisma, masterAdmin.id);
      await seedAuthorizedGateDInstallDomainAudit(prisma, masterAdmin.id);
      const service = app.get(PhysicalDeviceInventoryService);
      let installCalls = 0;
      const originalInstall = service.installOnVehicle.bind(service);
      service.installOnVehicle = async (...args) => {
        installCalls += 1;
        throw new Error('simulated install transport failure');
      };

      const outcome = await runOperator(
        {
          execute: true,
          confirmFlag: true,
          actorEmail: masterAdmin.email,
          operatorAttestation: ATTESTATION,
        },
        { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
      );
      service.installOnVehicle = originalInstall;

      expect(installCalls).toBe(1);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.stdout).toMatch(/"domainCommitStatus": "COMMITTED"/);
        expect(outcome.stdout).toMatch(/"idempotentReplay": true/);
        expect(outcome.stdout).toMatch(/"domainReconciliation"/);
      }
    });
  });

  describe('activity audit after domain commit', () => {
    it('returns exit 3 when audit.record returns null after successful install', async () => {
      const auditSvc = app.get(AuditService);
      const recordSpy = jest.spyOn(auditSvc, 'record').mockResolvedValue(null);
      const outcome = await runOperator(
        {
          execute: true,
          confirmFlag: true,
          actorEmail: masterAdmin.email,
          operatorAttestation: ATTESTATION,
        },
        { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
      );
      recordSpy.mockRestore();
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.exitCode).toBe(3);
        expect(outcome.stdout).toMatch(/"domainCommitStatus": "COMMITTED"/);
        expect(outcome.stdout).toMatch(/"recorded": false/);
      }
      const device = await prisma.physicalDevice.findUniqueOrThrow({
        where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
      });
      expect(device.status).toBe(PhysicalDeviceInventoryStatus.INSTALLED);
    });

    it('returns exit 3 when audit.record throws after successful install', async () => {
      await resetPdiP1b7GateDInstallState(prisma);
      const auditSvc = app.get(AuditService);
      const recordSpy = jest
        .spyOn(auditSvc, 'record')
        .mockRejectedValue(new Error('activity audit transport failure'));
      const outcome = await runOperator(
        {
          execute: true,
          confirmFlag: true,
          actorEmail: masterAdmin.email,
          operatorAttestation: ATTESTATION,
        },
        { PDI_P1B7_INSTALL_OPERATOR_ENABLED: 'true' },
      );
      recordSpy.mockRestore();
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.exitCode).toBe(3);
        expect(outcome.stdout).toMatch(/"domainCommitStatus": "COMMITTED"/);
        expect(outcome.stdout).toMatch(/activity audit transport failure/);
      }
    });
  });
});

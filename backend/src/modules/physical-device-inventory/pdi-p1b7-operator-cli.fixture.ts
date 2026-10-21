import {
  BusinessType,
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceIntakeSource,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  Prisma,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { insertDimoMirrorRaw } from '../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_CONNECTION_IDENTITY_CONTRACT_VERSION } from '@modules/vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION } from '../vehicle-onboarding/connection-identity/source-link-connection-identity.metadata';
import { PDI_P1B7_AUTHORIZED_INTAKE } from './pdi-p1b7-manual-intake-operator.lib';
import { PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY } from './pdi-p1b7-identity-verify-operator.lib';
import {
  PDI_P1B7_AUTHORIZED_INSTALL,
  buildPdiP1b7InstallDto,
} from './pdi-p1b7-install-operator.lib';
import { buildIdentityVerificationPayloadFingerprint } from './physical-device-identity-verification.fingerprint';
import { buildPdiP1b7IdentityVerifyDto } from './pdi-p1b7-identity-verify-operator.lib';
import { buildInstallPayloadFingerprint } from './physical-device-install.fingerprint';

export async function seedPdiP1b7OperatorPreflightIdentity(prisma: PrismaClient): Promise<void> {
  await prisma.organization.upsert({
    where: { id: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId },
    create: {
      id: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId,
      companyName: 'PDI P1B7 operator test org',
      businessType: BusinessType.RENTAL,
    },
    update: {},
  });

  const authorizedSerialJson = JSON.stringify({
    aftermarketDevice: { id: 'R1-test', serial: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber },
  });
  const existingDimo = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM dimo_vehicles
    WHERE token_id = ${PDI_P1B7_AUTHORIZED_INTAKE.dimoToken}::int
    LIMIT 1
  `;
  let dimoId = existingDimo[0]?.id;
  if (dimoId) {
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = ${authorizedSerialJson}::jsonb, updated_at = NOW()
      WHERE token_id = ${PDI_P1B7_AUTHORIZED_INTAKE.dimoToken}::int
    `;
  } else {
    dimoId = randomUUID();
    await insertDimoMirrorRaw(prisma, {
      id: dimoId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      tokenId: PDI_P1B7_AUTHORIZED_INTAKE.dimoToken,
      rawJson: {
        aftermarketDevice: { id: 'R1-test', serial: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber },
      },
    });
  }

  const vin = `PDI${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type,
      dimo_vehicle_id, registry_lifecycle, created_at, updated_at
    ) VALUES (
      ${PDI_P1B7_AUTHORIZED_INTAKE.vehicleId}::uuid,
      ${PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId}::uuid,
      ${vin},
      'VW',
      'Tiguan',
      2022,
      'GASOLINE',
      'LTE_R1',
      ${dimoId},
      'ACTIVE'::"VehicleRegistryLifecycle",
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      dimo_vehicle_id = EXCLUDED.dimo_vehicle_id
  `;
}

async function insertTestUser(
  prisma: PrismaClient,
  input: { email: string; name: string; status: UserStatus },
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, platform_role, status, created_at, updated_at)
    VALUES (
      ${id}::uuid,
      ${input.email},
      ${input.name},
      ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
      ${input.status}::"UserStatus",
      NOW(),
      NOW()
    )
  `;
  return { id, email: input.email };
}

export async function createOperatorTestMasterAdmin(prisma: PrismaClient): Promise<{
  id: string;
  email: string;
}> {
  const email = `pdi-operator-test-${randomUUID().slice(0, 8)}@acceptance.internal.synqdrive.eu`;
  return insertTestUser(prisma, {
    email,
    name: 'PDI Operator Test Master Admin',
    status: UserStatus.ACTIVE,
  });
}

export async function createInactiveSmokeStyleMasterAdmin(prisma: PrismaClient): Promise<{
  id: string;
  email: string;
}> {
  const email = `inactive-smoke-${randomUUID().slice(0, 8)}@acceptance.internal.synqdrive.eu`;
  return insertTestUser(prisma, {
    email,
    name: 'Inactive Master Admin',
    status: UserStatus.INACTIVE,
  });
}

export async function seedPdiP1b7GateCProviderLink(prisma: PrismaClient): Promise<{ linkId: string }> {
  const dimoRow = await prisma.$queryRaw<Array<{ id: string; external_id: string }>>`
    SELECT id::text AS id, external_id FROM dimo_vehicles
    WHERE token_id = ${PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken}::int
    LIMIT 1
  `;
  const dimoId = dimoRow[0]?.id;
  const externalId = dimoRow[0]?.external_id ?? `ext-${randomUUID().slice(0, 8)}`;
  if (!dimoId) {
    throw new Error('seedPdiP1b7GateCProviderLink: dimo mirror missing — run seedPdiP1b7OperatorPreflightIdentity first');
  }

  const existing = await prisma.vehicleDataSourceLink.findFirst({
    where: {
      vehicleId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId,
      provider: 'DIMO',
      isActive: true,
      supersededByLinkId: null,
    },
    select: { id: true },
  });
  if (existing) {
    return { linkId: existing.id };
  }

  const linkId = randomUUID();
  const consentId = randomUUID();
  const serial = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.serialNumber;
  const orgId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.ownerOrganizationId;
  const vehicleId = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId;

  await prisma.vehicleProviderConsent.create({
    data: {
      id: consentId,
      vehicleId,
      organizationId: orgId,
      provider: 'DIMO',
      grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
      status: VehicleProviderConsentStatus.ACTIVE,
      scopes: [],
    },
  });

  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      dimoVehicleId: dimoId,
      consentId,
      isActive: true,
      metadata: {
        connectionIdentity: {
          version: VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
          contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
          providerSourceLinkId: linkId,
          preActivationProviderSourceRefId: 'pdi-p1b7-gate-c-test',
          provider: 'DIMO',
          providerVehicleReference: externalId,
          sourceMirrorId: dimoId,
          proposedModality: 'HARDWARE_DEVICE',
          verifiedModality: 'HARDWARE_DEVICE',
          modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
          physicalDeviceReference: serial,
          verificationEvidence: [],
          verifiedAt: new Date().toISOString(),
          organizationId: orgId,
          vehicleId,
        },
      },
    },
  });

  return { linkId };
}

export async function seedPdiP1b7GateCPhysicalDevice(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<void> {
  const scope = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY;
  await prisma.physicalDevice.upsert({
    where: { id: scope.physicalDeviceId },
    create: {
      id: scope.physicalDeviceId,
      internalInventoryNumber: `PDI-GATEC-${scope.physicalDeviceId.slice(0, 8).toUpperCase()}`,
      manufacturer: 'Ruptela',
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      serialNumber: scope.serialNumber,
      ownerOrganizationId: scope.ownerOrganizationId,
      warehouseLocation: 'Lager',
      status: PhysicalDeviceInventoryStatus.AVAILABLE,
      identityStatus: PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION,
      recordedAt: new Date(),
      intakeSource: PhysicalDeviceIntakeSource.MANUAL_MASTER_ADMIN,
      identityEvidenceJson: {
        intakeKind: 'MANUAL_MASTER_ADMIN',
        confirmationLevel: 'MANUAL_INTAKE_UNVERIFIED',
      },
      createdByUserId: actorUserId,
    },
    update: {
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      serialNumber: scope.serialNumber,
      ownerOrganizationId: scope.ownerOrganizationId,
      identityStatus: PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION,
      status: PhysicalDeviceInventoryStatus.AVAILABLE,
    },
  });

  await prisma.physicalDeviceAssignment.deleteMany({
    where: {
      physicalDeviceId: scope.physicalDeviceId,
      assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
    },
  });
  await prisma.physicalDeviceAssignment.create({
    data: {
      physicalDeviceId: scope.physicalDeviceId,
      organizationId: scope.ownerOrganizationId,
      assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
      effectiveFrom: new Date(),
      idempotencyKey: PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey,
      actorUserId,
    },
  });
}

export async function seedPdiP1b7IdentityVerifyOperatorFixtures(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<void> {
  await seedPdiP1b7OperatorPreflightIdentity(prisma);
  await seedPdiP1b7GateCProviderLink(prisma);
  await seedPdiP1b7GateCPhysicalDevice(prisma, actorUserId);
}

export async function seedPdiP1b7GateCIdentityAudit(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<void> {
  const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
  const dto = buildPdiP1b7IdentityVerifyDto(actorUserId);
  const payloadFingerprint = buildIdentityVerificationPayloadFingerprint(deviceId, dto);
  await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
    where: {
      physicalDeviceId: deviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.gateCVerifyIdempotencyKey,
    },
  });
  await prisma.physicalDeviceInventoryAuditEvent.create({
    data: {
      physicalDeviceId: deviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      actorUserId,
      payloadFingerprint,
      idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.gateCVerifyIdempotencyKey,
      evidenceJson: {
        provesPhysicalInstall: false,
        attestationKind: dto.attestationKind,
        providerReconciliationVehicleId: dto.providerReconciliationVehicleId,
      },
    },
  });
}

export async function seedPdiP1b7GateDVerifiedDevice(prisma: PrismaClient): Promise<void> {
  await prisma.physicalDevice.update({
    where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
    data: {
      identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
      status: PhysicalDeviceInventoryStatus.AVAILABLE,
    },
  });
}

export async function resetPdiP1b7GateDInstallState(prisma: PrismaClient): Promise<void> {
  const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
  await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
    where: {
      physicalDeviceId: deviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
    },
  });
  await prisma.physicalDeviceAssignment.deleteMany({
    where: {
      physicalDeviceId: deviceId,
      assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
    },
  });
  await prisma.physicalDevice.update({
    where: { id: deviceId },
    data: {
      status: PhysicalDeviceInventoryStatus.AVAILABLE,
      identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
    },
  });
}

export async function seedPdiP1b7InstallOperatorFixtures(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<void> {
  await seedPdiP1b7IdentityVerifyOperatorFixtures(prisma, actorUserId);
  await seedPdiP1b7GateCIdentityAudit(prisma, actorUserId);
  await seedPdiP1b7GateDVerifiedDevice(prisma);
  await resetPdiP1b7GateDInstallState(prisma);
}

export async function seedAuthorizedGateDIdempotencyAssignment(
  prisma: PrismaClient,
  actorUserId: string,
  options?: {
    effectiveTo?: Date | null;
    deviceStatus?: PhysicalDeviceInventoryStatus;
    payloadFingerprint?: string | null;
    vehicleId?: string;
    omitFingerprint?: boolean;
  },
): Promise<{ assignmentId: string }> {
  const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
  const dto = buildPdiP1b7InstallDto();
  const fingerprint =
    options?.payloadFingerprint === undefined
      ? buildInstallPayloadFingerprint(deviceId, dto)
      : options.payloadFingerprint;
  const vehicleId = options?.vehicleId ?? PDI_P1B7_AUTHORIZED_INSTALL.vehicleId;

  await prisma.physicalDeviceAssignment.deleteMany({
    where: { idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey },
  });
  await prisma.physicalDeviceAssignment.deleteMany({
    where: {
      physicalDeviceId: deviceId,
      assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
    },
  });

  await prisma.physicalDevice.update({
    where: { id: deviceId },
    data: {
      status: options?.deviceStatus ?? PhysicalDeviceInventoryStatus.INSTALLED,
      identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
    },
  });

  const metadataJson: Record<string, unknown> = {
    installNotes: PDI_P1B7_AUTHORIZED_INSTALL.installNotes,
    hardwareAssignmentOnly: true,
    providerBindingMutated: false,
  };
  if (!options?.omitFingerprint && fingerprint) {
    metadataJson.payloadFingerprint = fingerprint;
  }

  const assignment = await prisma.physicalDeviceAssignment.create({
    data: {
      physicalDeviceId: deviceId,
      organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
      vehicleId,
      assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
      effectiveFrom: new Date(),
      effectiveTo: options?.effectiveTo ?? null,
      idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
      actorUserId,
      metadataJson: metadataJson as Prisma.InputJsonValue,
    },
  });

  return { assignmentId: assignment.id };
}

export async function seedAuthorizedGateDInstallDomainAudit(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<{ auditId: string }> {
  const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
  const dto = buildPdiP1b7InstallDto();
  const payloadFingerprint = buildInstallPayloadFingerprint(deviceId, dto);
  await prisma.physicalDeviceInventoryAuditEvent.deleteMany({
    where: {
      physicalDeviceId: deviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
    },
  });
  const audit = await prisma.physicalDeviceInventoryAuditEvent.create({
    data: {
      physicalDeviceId: deviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
      actorUserId,
      payloadFingerprint,
      evidenceJson: {
        vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        organizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
        installNotes: PDI_P1B7_AUTHORIZED_INSTALL.installNotes,
        providerBindingMutated: false,
        vehicleDataSourceLinksMutated: false,
      } as Prisma.InputJsonValue,
    },
  });
  return { auditId: audit.id };
}

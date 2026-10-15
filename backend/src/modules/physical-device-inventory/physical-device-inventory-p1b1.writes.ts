import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  Prisma,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import type { InstallPhysicalDeviceDto } from './dto/install-physical-device.dto';
import {
  PhysicalDeviceIdentityAttestationKind,
  type VerifyPhysicalDeviceIdentityDto,
} from './dto/verify-physical-device-identity.dto';
import { buildInstallPayloadFingerprint } from './physical-device-install.fingerprint';
import { buildIdentityVerificationPayloadFingerprint } from './physical-device-identity-verification.fingerprint';
import { evaluateIdentityVerification } from './physical-device-identity-verification.engine';
import { normalizePhysicalDeviceSerial } from './physical-device-identifier.normalize';
import { maskDeviceImei, maskDeviceSerial } from './physical-device-identifier.mask';
import { reconcileInventorySerialWithDimoMirror } from './physical-device-provider-reconciliation';
import {
  physicalDeviceAlreadyInstalled,
  physicalDeviceIdempotencyPayloadMismatch,
  physicalDeviceIdentityEvidenceInsufficient,
  physicalDeviceNotFound,
  physicalDeviceNotInstallEligible,
  physicalDeviceReviewerMismatch,
  physicalDeviceVehicleNotEligible,
  physicalDeviceVehicleOrgMismatch,
} from './physical-device-inventory.errors';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';

type Tx = Prisma.TransactionClient;

function readJsonIdempotencyKey(evidenceJson: unknown): string | null {
  if (!evidenceJson || typeof evidenceJson !== 'object' || Array.isArray(evidenceJson)) {
    return null;
  }
  const key = (evidenceJson as Record<string, unknown>).idempotencyKey;
  return typeof key === 'string' ? key : null;
}

function readAssignmentPayloadFingerprint(metadataJson: unknown): string | null {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
    return null;
  }
  const value = (metadataJson as Record<string, unknown>).payloadFingerprint;
  return typeof value === 'string' ? value : null;
}

export async function loadProviderReconciliationForVehicle(
  prisma: PrismaService | Tx,
  vehicleId: string,
  modelCode: PhysicalDeviceModelCode,
  inventorySerial: string,
) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      registryLifecycle: true,
      organizationId: true,
      dimoVehicle: { select: { externalId: true, rawJson: true } },
    },
  });
  if (!vehicle?.dimoVehicle?.rawJson) {
    return {
      vehicle,
      reconciliation: {
        ok: false as const,
        reasonCode: 'DIMO_MIRROR_MISSING',
        evidence: ['dimoVehicle:null'],
      },
    };
  }
  const reconciliation = reconcileInventorySerialWithDimoMirror({
    modelCode,
    inventorySerial,
    dimoRawJson: vehicle.dimoVehicle.rawJson,
    dimoExternalId: vehicle.dimoVehicle.externalId,
  });
  return { vehicle, reconciliation };
}

export async function verifyPhysicalDeviceIdentityTx(
  prisma: PrismaService,
  deviceId: string,
  dto: VerifyPhysicalDeviceIdentityDto,
  actorUserId: string | null,
  toListItem: (row: Parameters<typeof toListItemStub>[0]) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  if (!actorUserId || dto.reviewerUserId !== actorUserId) {
    throw physicalDeviceReviewerMismatch();
  }

  const payloadFingerprint = buildIdentityVerificationPayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const priorEvents = await prisma.physicalDeviceInventoryAuditEvent.findMany({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const prior = priorEvents.find((e) => readJsonIdempotencyKey(e.evidenceJson) === idempotencyKey);
    if (prior) {
      if (prior.payloadFingerprint !== payloadFingerprint) {
        throw physicalDeviceIdempotencyPayloadMismatch();
      }
      const device = await prisma.physicalDevice.findUnique({
        where: { id: deviceId },
        include: {
          assignments: {
            where: { vehicleId: { not: null }, effectiveTo: null },
            take: 1,
          },
        },
      });
      if (!device) throw physicalDeviceNotFound();
      return toListItem(device);
    }
  }

  return prisma.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

    const device = await tx.physicalDevice.findUnique({
      where: { id: deviceId },
      include: {
        assignments: {
          where: { vehicleId: { not: null }, effectiveTo: null },
          take: 1,
        },
      },
    });
    if (!device) throw physicalDeviceNotFound();

    const serialNorm = normalizePhysicalDeviceSerial(device.serialNumber ?? undefined, device.modelCode);

    let providerReconciliation = null;
    if (
      dto.attestationKind === PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION
    ) {
      if (!dto.providerReconciliationVehicleId) {
        throw physicalDeviceIdentityEvidenceInsufficient('PROVIDER_RECONCILIATION_VEHICLE_REQUIRED');
      }
      const { vehicle, reconciliation } = await loadProviderReconciliationForVehicle(
        tx,
        dto.providerReconciliationVehicleId,
        device.modelCode,
        device.serialNumber ?? '',
      );
      if (!vehicle || vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
        throw physicalDeviceVehicleNotEligible('RECONCILIATION_VEHICLE_NOT_ACTIVE');
      }
      providerReconciliation = reconciliation;
    }

    const evaluation = evaluateIdentityVerification({
      modelCode: device.modelCode,
      identityStatus: device.identityStatus,
      serialNumber: device.serialNumber,
      serialClarificationReason: serialNorm.clarificationReason,
      attestationKind: dto.attestationKind,
      providerReconciliation,
    });

    if (!evaluation.ok) {
      throw physicalDeviceIdentityEvidenceInsufficient(evaluation.reasonCode);
    }

    const verifiedAt = new Date();
    const evidenceJson = {
      verificationMethod: evaluation.verificationMethod,
      attestationKind: dto.attestationKind,
      reviewerUserId: dto.reviewerUserId,
      reviewerNotes: dto.reviewerNotes?.trim() || null,
      providerReconciliationVehicleId: dto.providerReconciliationVehicleId ?? null,
      evidence: evaluation.evidence,
      serialNumberMasked: maskDeviceSerial(device.serialNumber),
      imeiMasked: maskDeviceImei(device.imei),
      idempotencyKey,
      verifiedAt: verifiedAt.toISOString(),
    };

    const updated = await tx.physicalDevice.update({
      where: { id: deviceId },
      data: {
        identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
        identityEvidenceJson: {
          ...(device.identityEvidenceJson as object),
          verification: evidenceJson,
        } as Prisma.InputJsonValue,
      },
      include: {
        assignments: {
          where: { vehicleId: { not: null }, effectiveTo: null },
          take: 1,
        },
      },
    });

    await tx.physicalDeviceInventoryAuditEvent.create({
      data: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
        actorUserId,
        payloadFingerprint,
        evidenceJson: evidenceJson as Prisma.InputJsonValue,
      },
    });

    return toListItem(updated);
  });
}

function toListItemStub(_row: unknown): PhysicalDeviceListItemDto {
  throw new Error('stub');
}

export async function installPhysicalDeviceOnVehicleTx(
  prisma: PrismaService,
  deviceId: string,
  dto: InstallPhysicalDeviceDto,
  actorUserId: string | null,
  toListItem: (row: Parameters<typeof toListItemStub>[0]) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  const payloadFingerprint = buildInstallPayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const existingAssignment = await prisma.physicalDeviceAssignment.findUnique({
      where: { idempotencyKey },
      include: {
        physicalDevice: {
          include: {
            assignments: {
              where: { vehicleId: { not: null }, effectiveTo: null },
              take: 1,
            },
          },
        },
      },
    });
    if (existingAssignment?.physicalDevice) {
      const stored = readAssignmentPayloadFingerprint(existingAssignment.metadataJson);
      if (stored && stored !== payloadFingerprint) {
        throw physicalDeviceIdempotencyPayloadMismatch();
      }
      return toListItem(existingAssignment.physicalDevice);
    }
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: {
          assignments: {
            where: { vehicleId: { not: null }, effectiveTo: null },
            take: 1,
          },
        },
      });
      if (!device) throw physicalDeviceNotFound();

      if (device.identityStatus !== PhysicalDeviceIdentityStatus.VERIFIED) {
        throw physicalDeviceNotInstallEligible('IDENTITY_NOT_VERIFIED');
      }
      if (device.assignments.some((a) => a.vehicleId)) {
        throw physicalDeviceAlreadyInstalled();
      }
      if (device.status !== PhysicalDeviceInventoryStatus.AVAILABLE) {
        throw physicalDeviceNotInstallEligible(`STATUS_${device.status}`);
      }

      const vehicle = await tx.vehicle.findUnique({
        where: { id: dto.vehicleId },
        select: { id: true, organizationId: true, registryLifecycle: true },
      });
      if (!vehicle) {
        throw physicalDeviceVehicleNotEligible('VEHICLE_NOT_FOUND');
      }
      if (vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
        throw physicalDeviceVehicleNotEligible(`REGISTRY_${vehicle.registryLifecycle}`);
      }
      if (
        device.ownerOrganizationId &&
        device.ownerOrganizationId !== vehicle.organizationId
      ) {
        throw physicalDeviceVehicleOrgMismatch();
      }

      const effectiveFrom = new Date();
      await tx.physicalDevice.update({
        where: { id: deviceId },
        data: { status: PhysicalDeviceInventoryStatus.INSTALLED },
      });

      await tx.physicalDeviceAssignment.create({
        data: {
          physicalDeviceId: deviceId,
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
          effectiveFrom,
          idempotencyKey,
          actorUserId,
          metadataJson: {
            payloadFingerprint,
            installNotes: dto.installNotes?.trim() || null,
            hardwareAssignmentOnly: true,
            providerBindingMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.physicalDeviceInventoryAuditEvent.create({
        data: {
          physicalDeviceId: deviceId,
          eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
          actorUserId,
          payloadFingerprint,
          evidenceJson: {
            vehicleId: vehicle.id,
            organizationId: vehicle.organizationId,
            effectiveFrom: effectiveFrom.toISOString(),
            idempotencyKey,
            installNotes: dto.installNotes?.trim() || null,
            providerBindingMutated: false,
            vehicleDataSourceLinksMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      const withActive = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: {
          assignments: {
            where: { vehicleId: { not: null }, effectiveTo: null },
            take: 1,
          },
        },
      });
      return toListItem(withActive!);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw physicalDeviceAlreadyInstalled();
    }
    throw error;
  }
}

import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import type { MarkPhysicalDeviceDefectiveDto } from './dto/mark-physical-device-defective.dto';
import type { MarkPhysicalDeviceLostDto } from './dto/mark-physical-device-lost.dto';
import { PhysicalDeviceLossAttestationKind } from './dto/mark-physical-device-lost.dto';
import type { RetirePhysicalDeviceDto } from './dto/retire-physical-device.dto';
import type { ReturnPhysicalDeviceToStockDto } from './dto/return-physical-device-to-stock.dto';
import {
  PhysicalDeviceUninstallCondition,
  type UninstallPhysicalDeviceDto,
} from './dto/uninstall-physical-device.dto';
import {
  buildMarkDefectivePayloadFingerprint,
  buildMarkLostPayloadFingerprint,
  buildRetirePayloadFingerprint,
  buildReturnToStockPayloadFingerprint,
  buildUninstallPayloadFingerprint,
} from './physical-device-lifecycle.fingerprint';
import {
  assertDeviceInstallStatusConsistency,
  assertNoActiveVehicleInstall,
  assertOwnerOrganizationMatchesVehicle,
  requireActiveVehicleInstallAssignment,
} from './physical-device-lifecycle.consistency';
import {
  physicalDeviceActiveVehicleAssignment,
  physicalDeviceAssignmentMismatch,
  physicalDeviceIdempotencyPayloadMismatch,
  physicalDeviceLifecycleNotEligible,
  physicalDeviceLossEvidenceInsufficient,
  physicalDeviceNotFound,
  physicalDeviceNotUninstallEligible,
} from './physical-device-inventory.errors';

export { selectActiveVehicleInstallAssignment } from './physical-device-lifecycle.consistency';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';

type Tx = Prisma.TransactionClient;

type ListItemRow = Parameters<
  (row: {
    id: string;
    internalInventoryNumber: string;
    manufacturer: string;
    modelCode: import('@prisma/client').PhysicalDeviceModelCode;
    serialNumber: string | null;
    imei: string | null;
    ownerOrganizationId: string | null;
    warehouseLocation: string;
    status: PhysicalDeviceInventoryStatus;
    identityStatus: import('@prisma/client').PhysicalDeviceIdentityStatus;
    recordedAt: Date;
    assignments?: Array<{ vehicleId: string | null }>;
  }) => PhysicalDeviceListItemDto
>[0];

function assertNonEmptyText(value: string | undefined | null, code: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    throw physicalDeviceLifecycleNotEligible(code);
  }
  return trimmed;
}

async function observeActiveProviderLinks(tx: Tx, vehicleId: string) {
  const count = await tx.vehicleDataSourceLink.count({
    where: { vehicleId, isActive: true },
  });
  return {
    activeVehicleDataSourceLinkCount: count,
    providerBindingMutated: false,
    vehicleDataSourceLinksMutated: false,
    deviationVisible: count > 0,
  };
}

async function replayLifecycleAudit(
  prisma: PrismaService | Tx,
  deviceId: string,
  eventKind: PhysicalDeviceInventoryAuditEventKind,
  idempotencyKey: string,
  payloadFingerprint: string,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
) {
  const prior = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
    where: { physicalDeviceId: deviceId, idempotencyKey, eventKind },
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
  if (!prior?.physicalDevice) return null;
  if (prior.physicalDeviceId !== deviceId) {
    throw physicalDeviceIdempotencyPayloadMismatch();
  }
  if (prior.payloadFingerprint !== payloadFingerprint) {
    throw physicalDeviceIdempotencyPayloadMismatch();
  }
  return toListItem(prior.physicalDevice);
}

function assertOffVehicleLifecycleEligible(
  status: PhysicalDeviceInventoryStatus,
  assignments: Array<{
    assignmentKind: PhysicalDeviceAssignmentKind;
    vehicleId: string | null;
    effectiveTo: Date | null;
    organizationId?: string | null;
  }>,
): void {
  assertDeviceInstallStatusConsistency(status, assignments);
  if (status === PhysicalDeviceInventoryStatus.INSTALLED) {
    throw physicalDeviceActiveVehicleAssignment();
  }
}

export async function uninstallPhysicalDeviceTx(
  prisma: PrismaService,
  deviceId: string,
  dto: UninstallPhysicalDeviceDto,
  actorUserId: string | null,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  const payloadFingerprint = buildUninstallPayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await replayLifecycleAudit(
      prisma,
      deviceId,
      PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
      idempotencyKey,
      payloadFingerprint,
      toListItem,
    );
    if (replay) return replay;
  }

  const uninstallReason = assertNonEmptyText(dto.uninstallReason, 'UNINSTALL_REASON_REQUIRED');
  if (dto.deviceConditionAfterUninstall === PhysicalDeviceUninstallCondition.DEFECTIVE) {
    assertNonEmptyText(dto.defectDescription, 'DEFECT_DESCRIPTION_REQUIRED');
  }
  if (dto.physicalReturnConfirmed) {
    assertNonEmptyText(dto.warehouseLocation, 'WAREHOUSE_REQUIRED_FOR_RETURN');
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: { assignments: true },
      });
      if (!device) throw physicalDeviceNotFound();
      if (device.status !== PhysicalDeviceInventoryStatus.INSTALLED) {
        if (idempotencyKey) {
          const replay = await replayLifecycleAudit(
            tx,
            deviceId,
            PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
            idempotencyKey,
            payloadFingerprint,
            toListItem,
          );
          if (replay) return replay;
        }
        throw physicalDeviceNotUninstallEligible(`STATUS_${device.status}`);
      }

      assertDeviceInstallStatusConsistency(device.status, device.assignments);
      const activeInstall = requireActiveVehicleInstallAssignment(device.assignments);
      if (activeInstall.id !== dto.assignmentId || activeInstall.vehicleId !== dto.vehicleId) {
        throw physicalDeviceAssignmentMismatch();
      }

      const vehicle = await tx.vehicle.findUnique({
        where: { id: dto.vehicleId },
        select: { id: true, organizationId: true },
      });
      if (!vehicle) {
        throw physicalDeviceAssignmentMismatch();
      }
      assertOwnerOrganizationMatchesVehicle(device.ownerOrganizationId, vehicle.organizationId);

      const effectiveTo = new Date();
      let nextStatus: PhysicalDeviceInventoryStatus;
      if (dto.deviceConditionAfterUninstall === PhysicalDeviceUninstallCondition.DEFECTIVE) {
        nextStatus = PhysicalDeviceInventoryStatus.DEFECTIVE;
      } else if (dto.physicalReturnConfirmed) {
        nextStatus = PhysicalDeviceInventoryStatus.AVAILABLE;
      } else {
        nextStatus = PhysicalDeviceInventoryStatus.PENDING_RETURN;
      }

      const providerObservation = await observeActiveProviderLinks(tx, dto.vehicleId);

      await tx.physicalDeviceAssignment.update({
        where: { id: activeInstall.id },
        data: { effectiveTo },
      });

      const warehouseUpdate =
        dto.physicalReturnConfirmed && dto.warehouseLocation?.trim()
          ? dto.warehouseLocation.trim()
          : undefined;

      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: {
          status: nextStatus,
          ...(warehouseUpdate ? { warehouseLocation: warehouseUpdate } : {}),
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
          eventKind: PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
          actorUserId,
          payloadFingerprint,
          idempotencyKey,
          evidenceJson: {
            vehicleId: dto.vehicleId,
            assignmentId: dto.assignmentId,
            effectiveTo: effectiveTo.toISOString(),
            uninstallReason,
            deviceConditionAfterUninstall: dto.deviceConditionAfterUninstall,
            physicalReturnConfirmed: dto.physicalReturnConfirmed,
            warehouseLocationApplied: warehouseUpdate ?? null,
            defectDescription: dto.defectDescription?.trim() ?? null,
            vehicleRegistryMutated: false,
            dimoProviderMutated: false,
            ...providerObservation,
          } as Prisma.InputJsonValue,
        },
      });

      return toListItem(updated);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
      const replay = await replayLifecycleAudit(
        prisma,
        deviceId,
        PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
        idempotencyKey,
        payloadFingerprint,
        toListItem,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

export async function returnPhysicalDeviceToStockTx(
  prisma: PrismaService,
  deviceId: string,
  dto: ReturnPhysicalDeviceToStockDto,
  actorUserId: string | null,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  const payloadFingerprint = buildReturnToStockPayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await replayLifecycleAudit(
      prisma,
      deviceId,
      PhysicalDeviceInventoryAuditEventKind.RETURN_TO_STOCK,
      idempotencyKey,
      payloadFingerprint,
      toListItem,
    );
    if (replay) return replay;
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: { assignments: true },
      });
      if (!device) throw physicalDeviceNotFound();
      assertOffVehicleLifecycleEligible(device.status, device.assignments);

      if (device.status !== PhysicalDeviceInventoryStatus.PENDING_RETURN) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

      const warehouseLocation = assertNonEmptyText(dto.warehouseLocation, 'WAREHOUSE_REQUIRED');
      const returnedAt = new Date();
      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: {
          status: PhysicalDeviceInventoryStatus.AVAILABLE,
          warehouseLocation,
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
          eventKind: PhysicalDeviceInventoryAuditEventKind.RETURN_TO_STOCK,
          actorUserId,
          payloadFingerprint,
          idempotencyKey,
          evidenceJson: {
            returnedAt: returnedAt.toISOString(),
            warehouseLocation,
            returnNotes: dto.returnNotes?.trim() ?? null,
            providerBindingMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      return toListItem(updated);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
      const replay = await replayLifecycleAudit(
        prisma,
        deviceId,
        PhysicalDeviceInventoryAuditEventKind.RETURN_TO_STOCK,
        idempotencyKey,
        payloadFingerprint,
        toListItem,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

export async function markPhysicalDeviceDefectiveTx(
  prisma: PrismaService,
  deviceId: string,
  dto: MarkPhysicalDeviceDefectiveDto,
  actorUserId: string | null,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  const payloadFingerprint = buildMarkDefectivePayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await replayLifecycleAudit(
      prisma,
      deviceId,
      PhysicalDeviceInventoryAuditEventKind.MARK_DEFECTIVE,
      idempotencyKey,
      payloadFingerprint,
      toListItem,
    );
    if (replay) return replay;
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: { assignments: true },
      });
      if (!device) throw physicalDeviceNotFound();
      assertOffVehicleLifecycleEligible(device.status, device.assignments);
      if (device.status === PhysicalDeviceInventoryStatus.DEFECTIVE) {
        throw physicalDeviceLifecycleNotEligible('ALREADY_DEFECTIVE');
      }
      if (
        device.status !== PhysicalDeviceInventoryStatus.AVAILABLE &&
        device.status !== PhysicalDeviceInventoryStatus.RESERVED &&
        device.status !== PhysicalDeviceInventoryStatus.PENDING_RETURN
      ) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

      const defectDescription = assertNonEmptyText(
        dto.defectDescription,
        'DEFECT_DESCRIPTION_REQUIRED',
      );

      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: { status: PhysicalDeviceInventoryStatus.DEFECTIVE },
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
          eventKind: PhysicalDeviceInventoryAuditEventKind.MARK_DEFECTIVE,
          actorUserId,
          payloadFingerprint,
          idempotencyKey,
          evidenceJson: {
            defectDescription,
            installEligibleAfter: false,
            providerBindingMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      return toListItem(updated);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
      const replay = await replayLifecycleAudit(
        prisma,
        deviceId,
        PhysicalDeviceInventoryAuditEventKind.MARK_DEFECTIVE,
        idempotencyKey,
        payloadFingerprint,
        toListItem,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

export async function markPhysicalDeviceLostTx(
  prisma: PrismaService,
  deviceId: string,
  dto: MarkPhysicalDeviceLostDto,
  actorUserId: string | null,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  if (dto.lossAttestationKind !== PhysicalDeviceLossAttestationKind.MASTER_ADMIN_LOSS_CONFIRMATION) {
    throw physicalDeviceLossEvidenceInsufficient('LOSS_ATTESTATION_KIND_NOT_ALLOWED');
  }
  if (!dto.lossEvidenceNotes?.trim()) {
    throw physicalDeviceLossEvidenceInsufficient('LOSS_EVIDENCE_REQUIRED');
  }

  const payloadFingerprint = buildMarkLostPayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await replayLifecycleAudit(
      prisma,
      deviceId,
      PhysicalDeviceInventoryAuditEventKind.MARK_LOST,
      idempotencyKey,
      payloadFingerprint,
      toListItem,
    );
    if (replay) return replay;
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: { assignments: true },
      });
      if (!device) throw physicalDeviceNotFound();
      assertOffVehicleLifecycleEligible(device.status, device.assignments);
      if (device.status === PhysicalDeviceInventoryStatus.LOST) {
        throw physicalDeviceLifecycleNotEligible('ALREADY_LOST');
      }
      if (device.status === PhysicalDeviceInventoryStatus.RETIRED) {
        throw physicalDeviceLifecycleNotEligible('STATUS_RETIRED');
      }
      if (
        device.status !== PhysicalDeviceInventoryStatus.AVAILABLE &&
        device.status !== PhysicalDeviceInventoryStatus.RESERVED &&
        device.status !== PhysicalDeviceInventoryStatus.PENDING_RETURN &&
        device.status !== PhysicalDeviceInventoryStatus.DEFECTIVE
      ) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

      const lossEvidenceNotes = assertNonEmptyText(
        dto.lossEvidenceNotes,
        'LOSS_EVIDENCE_REQUIRED',
      );

      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: { status: PhysicalDeviceInventoryStatus.LOST },
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
          eventKind: PhysicalDeviceInventoryAuditEventKind.MARK_LOST,
          actorUserId,
          payloadFingerprint,
          idempotencyKey,
          evidenceJson: {
            lossAttestationKind: dto.lossAttestationKind,
            lossEvidenceNotes,
            telemetryDerivedLossRejected: true,
            providerBindingMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      return toListItem(updated);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
      const replay = await replayLifecycleAudit(
        prisma,
        deviceId,
        PhysicalDeviceInventoryAuditEventKind.MARK_LOST,
        idempotencyKey,
        payloadFingerprint,
        toListItem,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

export async function retirePhysicalDeviceTx(
  prisma: PrismaService,
  deviceId: string,
  dto: RetirePhysicalDeviceDto,
  actorUserId: string | null,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
): Promise<PhysicalDeviceListItemDto> {
  const payloadFingerprint = buildRetirePayloadFingerprint(deviceId, dto);
  const idempotencyKey = dto.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await replayLifecycleAudit(
      prisma,
      deviceId,
      PhysicalDeviceInventoryAuditEventKind.RETIRE,
      idempotencyKey,
      payloadFingerprint,
      toListItem,
    );
    if (replay) return replay;
  }

  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT id FROM physical_devices WHERE id = ${deviceId} FOR UPDATE`;

      const device = await tx.physicalDevice.findUnique({
        where: { id: deviceId },
        include: { assignments: true },
      });
      if (!device) throw physicalDeviceNotFound();
      assertOffVehicleLifecycleEligible(device.status, device.assignments);
      if (device.status === PhysicalDeviceInventoryStatus.RETIRED) {
        throw physicalDeviceLifecycleNotEligible('ALREADY_RETIRED');
      }
      if (device.status === PhysicalDeviceInventoryStatus.LOST) {
        throw physicalDeviceLifecycleNotEligible('STATUS_LOST');
      }
      if (
        device.status !== PhysicalDeviceInventoryStatus.AVAILABLE &&
        device.status !== PhysicalDeviceInventoryStatus.RESERVED &&
        device.status !== PhysicalDeviceInventoryStatus.PENDING_RETURN &&
        device.status !== PhysicalDeviceInventoryStatus.DEFECTIVE
      ) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

      const retireReason = assertNonEmptyText(dto.retireReason, 'RETIRE_REASON_REQUIRED');

      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: { status: PhysicalDeviceInventoryStatus.RETIRED },
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
          eventKind: PhysicalDeviceInventoryAuditEventKind.RETIRE,
          actorUserId,
          payloadFingerprint,
          idempotencyKey,
          evidenceJson: {
            retireReason,
            automaticRetirement: false,
            providerBindingMutated: false,
          } as Prisma.InputJsonValue,
        },
      });

      return toListItem(updated);
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
      const replay = await replayLifecycleAudit(
        prisma,
        deviceId,
        PhysicalDeviceInventoryAuditEventKind.RETIRE,
        idempotencyKey,
        payloadFingerprint,
        toListItem,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

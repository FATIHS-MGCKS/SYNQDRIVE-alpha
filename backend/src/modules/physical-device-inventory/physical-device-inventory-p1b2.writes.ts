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
  physicalDeviceActiveVehicleAssignment,
  physicalDeviceAssignmentMismatch,
  physicalDeviceIdempotencyPayloadMismatch,
  physicalDeviceLifecycleNotEligible,
  physicalDeviceLossEvidenceInsufficient,
  physicalDeviceNotFound,
  physicalDeviceNotInstalled,
  physicalDeviceNotUninstallEligible,
} from './physical-device-inventory.errors';
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

export function selectActiveVehicleInstallAssignment<
  T extends {
    assignmentKind: PhysicalDeviceAssignmentKind;
    vehicleId: string | null;
    effectiveTo: Date | null;
  },
>(assignments: T[]): T | null {
  const active = assignments.filter(
    (a) =>
      a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL &&
      a.vehicleId != null &&
      a.effectiveTo == null,
  );
  if (active.length !== 1) return active[0] ?? null;
  return active[0];
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
  prisma: PrismaService,
  deviceId: string,
  eventKind: PhysicalDeviceInventoryAuditEventKind,
  idempotencyKey: string,
  payloadFingerprint: string,
  toListItem: (row: ListItemRow) => PhysicalDeviceListItemDto,
) {
  const prior = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
    where: { idempotencyKey, eventKind },
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

function assertNoActiveVehicleInstall(
  assignments: Array<{
    assignmentKind: PhysicalDeviceAssignmentKind;
    vehicleId: string | null;
    effectiveTo: Date | null;
    id?: string;
  }>,
) {
  const active = selectActiveVehicleInstallAssignment(assignments);
  if (active) {
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

  if (dto.deviceConditionAfterUninstall === PhysicalDeviceUninstallCondition.DEFECTIVE) {
    if (!dto.defectDescription?.trim()) {
      throw physicalDeviceNotUninstallEligible('DEFECT_DESCRIPTION_REQUIRED');
    }
  }
  if (dto.physicalReturnConfirmed) {
    if (!dto.warehouseLocation?.trim()) {
      throw physicalDeviceNotUninstallEligible('WAREHOUSE_REQUIRED_FOR_RETURN');
    }
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
        throw physicalDeviceNotUninstallEligible(`STATUS_${device.status}`);
      }

      const activeInstall = selectActiveVehicleInstallAssignment(device.assignments);
      if (!activeInstall) {
        throw physicalDeviceNotInstalled();
      }
      if (activeInstall.id !== dto.assignmentId || activeInstall.vehicleId !== dto.vehicleId) {
        throw physicalDeviceAssignmentMismatch();
      }

      const effectiveTo = new Date();
      const nextStatus =
        dto.deviceConditionAfterUninstall === PhysicalDeviceUninstallCondition.DEFECTIVE
          ? PhysicalDeviceInventoryStatus.DEFECTIVE
          : PhysicalDeviceInventoryStatus.AVAILABLE;

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
            uninstallReason: dto.uninstallReason.trim(),
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
      assertNoActiveVehicleInstall(device.assignments);

      if (
        device.status !== PhysicalDeviceInventoryStatus.AVAILABLE &&
        device.status !== PhysicalDeviceInventoryStatus.RESERVED
      ) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

      const returnedAt = new Date();
      const updated = await tx.physicalDevice.update({
        where: { id: deviceId },
        data: {
          status: PhysicalDeviceInventoryStatus.AVAILABLE,
          warehouseLocation: dto.warehouseLocation.trim(),
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
            warehouseLocation: dto.warehouseLocation.trim(),
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
      assertNoActiveVehicleInstall(device.assignments);

      if (
        device.status === PhysicalDeviceInventoryStatus.INSTALLED ||
        device.status === PhysicalDeviceInventoryStatus.LOST ||
        device.status === PhysicalDeviceInventoryStatus.RETIRED
      ) {
        throw physicalDeviceLifecycleNotEligible(`STATUS_${device.status}`);
      }

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
            defectDescription: dto.defectDescription.trim(),
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
      assertNoActiveVehicleInstall(device.assignments);

      if (device.status === PhysicalDeviceInventoryStatus.RETIRED) {
        throw physicalDeviceLifecycleNotEligible('STATUS_RETIRED');
      }

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
            lossEvidenceNotes: dto.lossEvidenceNotes.trim(),
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
      assertNoActiveVehicleInstall(device.assignments);

      if (device.status === PhysicalDeviceInventoryStatus.RETIRED) {
        throw physicalDeviceLifecycleNotEligible('ALREADY_RETIRED');
      }
      if (device.status === PhysicalDeviceInventoryStatus.INSTALLED) {
        throw physicalDeviceLifecycleNotEligible('STATUS_INSTALLED');
      }

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
            retireReason: dto.retireReason.trim(),
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

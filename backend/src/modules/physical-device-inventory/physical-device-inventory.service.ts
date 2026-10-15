import { Injectable } from '@nestjs/common';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceIntakeSource,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import type { ManualIntakePhysicalDeviceDto } from './dto/manual-intake-physical-device.dto';
import { buildManualIntakePayloadFingerprint } from './physical-device-intake.fingerprint';
import { normalizePhysicalDeviceIdentifiers } from './physical-device-identifier.normalize';
import {
  physicalDeviceIdempotencyPayloadMismatch,
  physicalDeviceImeiConflict,
  physicalDeviceOwnerOrgNotFound,
  physicalDeviceSerialConflict,
} from './physical-device-inventory.errors';
import { maskDeviceImei, maskDeviceSerial } from './physical-device-identifier.mask';
import {
  PHYSICAL_DEVICE_MANUFACTURER_BY_MODEL,
  type PhysicalDeviceListItemDto,
  type PhysicalDeviceStockSummaryDto,
} from './physical-device-inventory.types';
import type { ListPhysicalDevicesQueryDto } from './dto/list-physical-devices-query.dto';
import type { VerifyPhysicalDeviceIdentityDto } from './dto/verify-physical-device-identity.dto';
import type { InstallPhysicalDeviceDto } from './dto/install-physical-device.dto';
import { isPhysicalDeviceInventoryP1b1WritesEnabled } from './physical-device-inventory.config';
import {
  installPhysicalDeviceOnVehicleTx,
  verifyPhysicalDeviceIdentityTx,
} from './physical-device-inventory-p1b1.writes';
import { physicalDeviceNotFound, physicalDeviceP1b1WritesDisabled } from './physical-device-inventory.errors';
import type { PhysicalDeviceDetailDto } from './physical-device-inventory.types';

const MANUAL_INTAKE_IDENTITY_STATUS = PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION;

function allocateInternalInventoryNumber(): string {
  return `PDI-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function readAssignmentPayloadFingerprint(metadataJson: unknown): string | null {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
    return null;
  }
  const value = (metadataJson as Record<string, unknown>).payloadFingerprint;
  return typeof value === 'string' ? value : null;
}

@Injectable()
export class PhysicalDeviceInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private assertP1b1WritesEnabled(): void {
    if (!isPhysicalDeviceInventoryP1b1WritesEnabled()) {
      throw physicalDeviceP1b1WritesDisabled();
    }
  }

  private listItemMapper = (row: Parameters<PhysicalDeviceInventoryService['toListItem']>[0]) =>
    this.toListItem(row);

  async listDevices(
    query: ListPhysicalDevicesQueryDto,
  ): Promise<{ items: PhysicalDeviceListItemDto[]; total: number }> {
    const where: Prisma.PhysicalDeviceWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.modelCode) where.modelCode = query.modelCode;
    if (query.warehouseLocation) where.warehouseLocation = query.warehouseLocation;
    if (query.ownerOrganizationId) where.ownerOrganizationId = query.ownerOrganizationId;
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { internalInventoryNumber: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { warehouseLocation: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const skip = Math.max(query.offset ?? 0, 0);

    const [rows, total] = await Promise.all([
      this.prisma.physicalDevice.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take,
        skip,
        include: {
          assignments: {
            where: { vehicleId: { not: null }, effectiveTo: null },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.physicalDevice.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async getStockSummary(): Promise<PhysicalDeviceStockSummaryDto> {
    const [total, byStatus, byModel, byLocation] = await Promise.all([
      this.prisma.physicalDevice.count(),
      this.prisma.physicalDevice.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.physicalDevice.groupBy({ by: ['modelCode'], _count: { _all: true } }),
      this.prisma.physicalDevice.groupBy({
        by: ['warehouseLocation'],
        _count: { _all: true },
        orderBy: { warehouseLocation: 'asc' },
      }),
    ]);

    const statusMap = Object.values(PhysicalDeviceInventoryStatus).reduce(
      (acc, s) => {
        acc[s] = 0;
        return acc;
      },
      {} as Record<PhysicalDeviceInventoryStatus, number>,
    );
    for (const row of byStatus) {
      statusMap[row.status] = row._count._all;
    }

    const modelMap = Object.values(PhysicalDeviceModelCode).reduce(
      (acc, m) => {
        acc[m] = 0;
        return acc;
      },
      {} as Record<PhysicalDeviceModelCode, number>,
    );
    for (const row of byModel) {
      modelMap[row.modelCode] = row._count._all;
    }

    return {
      total,
      byStatus: statusMap,
      byModel: modelMap,
      byWarehouseLocation: byLocation.map((row) => ({
        warehouseLocation: row.warehouseLocation,
        count: row._count._all,
      })),
    };
  }

  async getDeviceDetail(deviceId: string): Promise<PhysicalDeviceDetailDto> {
    const row = await this.prisma.physicalDevice.findUnique({
      where: { id: deviceId },
      include: {
        assignments: { orderBy: { effectiveFrom: 'desc' }, take: 50 },
        auditEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!row) {
      throw physicalDeviceNotFound();
    }
    const activeAssignments = row.assignments.filter(
      (a) => a.vehicleId && a.effectiveTo === null,
    );
    const list = this.toListItem({ ...row, assignments: activeAssignments });
    const identityEvidence = row.identityEvidenceJson as Record<string, unknown> | null;
    const verification = identityEvidence?.verification;
    return {
      ...list,
      intakeNotes: row.intakeNotes,
      identityEvidenceSummary:
        verification && typeof verification === 'object'
          ? String((verification as Record<string, unknown>).verificationMethod ?? 'pending')
          : row.identityStatus === PhysicalDeviceIdentityStatus.VERIFIED
            ? 'verified'
            : null,
      assignmentHistory: row.assignments.map((a) => ({
        id: a.id,
        assignmentKind: a.assignmentKind,
        vehicleId: a.vehicleId,
        organizationId: a.organizationId,
        effectiveFrom: a.effectiveFrom.toISOString(),
        effectiveTo: a.effectiveTo?.toISOString() ?? null,
        actorUserId: a.actorUserId,
      })),
      auditHistory: row.auditEvents.map((e) => ({
        id: e.id,
        eventKind: e.eventKind,
        createdAt: e.createdAt.toISOString(),
        actorUserId: e.actorUserId,
        evidenceSummary: e.eventKind,
      })),
    };
  }

  async verifyIdentity(
    deviceId: string,
    dto: VerifyPhysicalDeviceIdentityDto,
    actorUserId: string | null,
  ) {
    this.assertP1b1WritesEnabled();
    return verifyPhysicalDeviceIdentityTx(
      this.prisma,
      deviceId,
      dto,
      actorUserId,
      this.listItemMapper,
    );
  }

  async installOnVehicle(
    deviceId: string,
    dto: InstallPhysicalDeviceDto,
    actorUserId: string | null,
  ) {
    this.assertP1b1WritesEnabled();
    return installPhysicalDeviceOnVehicleTx(
      this.prisma,
      deviceId,
      dto,
      actorUserId,
      this.listItemMapper,
    );
  }

  async manualIntake(
    dto: ManualIntakePhysicalDeviceDto,
    actorUserId: string | null,
  ): Promise<PhysicalDeviceListItemDto> {
    const payloadFingerprint = buildManualIntakePayloadFingerprint(dto);
    const normalized = normalizePhysicalDeviceIdentifiers({
      modelCode: dto.modelCode,
      serialNumber: dto.serialNumber,
      imei: dto.imei,
    });
    const warehouseLocation = dto.warehouseLocation.trim();
    const ownerOrganizationId = dto.ownerOrganizationId ?? null;
    const idempotencyKey = dto.idempotencyKey?.trim() || null;

    if (idempotencyKey) {
      const existingAssignment = await this.prisma.physicalDeviceAssignment.findUnique({
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
        const storedFingerprint = readAssignmentPayloadFingerprint(existingAssignment.metadataJson);
        if (storedFingerprint && storedFingerprint !== payloadFingerprint) {
          throw physicalDeviceIdempotencyPayloadMismatch();
        }
        return this.toListItem(existingAssignment.physicalDevice);
      }
    }

    if (ownerOrganizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: ownerOrganizationId },
        select: { id: true },
      });
      if (!org) {
        throw physicalDeviceOwnerOrgNotFound();
      }
    }

    const recordedAt = new Date();
    const manufacturer = PHYSICAL_DEVICE_MANUFACTURER_BY_MODEL[dto.modelCode];
    const identityEvidenceJson = {
      intakeKind: 'MANUAL_MASTER_ADMIN',
      confirmationLevel: 'MANUAL_INTAKE_UNVERIFIED',
      recordedAt: recordedAt.toISOString(),
      actorUserId,
      serialClarificationReason: normalized.serialClarificationReason,
      imeiClarificationReason: normalized.imeiClarificationReason,
      payloadFingerprint,
    };

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const device = await tx.physicalDevice.create({
          data: {
            internalInventoryNumber: allocateInternalInventoryNumber(),
            manufacturer,
            modelCode: dto.modelCode,
            serialNumber: normalized.serialNumber,
            imei: normalized.imei,
            ownerOrganizationId,
            warehouseLocation,
            status: PhysicalDeviceInventoryStatus.AVAILABLE,
            identityStatus: MANUAL_INTAKE_IDENTITY_STATUS,
            recordedAt,
            intakeSource: PhysicalDeviceIntakeSource.MANUAL_MASTER_ADMIN,
            identityEvidenceJson: identityEvidenceJson as Prisma.InputJsonValue,
            intakeNotes: dto.intakeNotes?.trim() || null,
            createdByUserId: actorUserId,
          },
        });

        await tx.physicalDeviceAssignment.create({
          data: {
            physicalDeviceId: device.id,
            organizationId: ownerOrganizationId,
            vehicleId: null,
            assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
            effectiveFrom: recordedAt,
            idempotencyKey,
            actorUserId,
            metadataJson: {
              warehouseLocation,
              identityStatus: MANUAL_INTAKE_IDENTITY_STATUS,
              payloadFingerprint,
            } as Prisma.InputJsonValue,
          },
        });

        await tx.physicalDeviceInventoryAuditEvent.create({
          data: {
            physicalDeviceId: device.id,
            eventKind: PhysicalDeviceInventoryAuditEventKind.MANUAL_INTAKE,
            actorUserId,
            payloadFingerprint,
            evidenceJson: {
              ...identityEvidenceJson,
              internalInventoryNumber: device.internalInventoryNumber,
              modelCode: dto.modelCode,
              serialNumberMasked: maskDeviceSerial(normalized.serialNumber),
              imeiMasked: maskDeviceImei(normalized.imei),
            } as Prisma.InputJsonValue,
          },
        });

        return device;
      });

      return this.toListItem({ ...created, assignments: [] });
    } catch (error) {
      if (isPrismaUniqueViolation(error) && normalized.serialNumber) {
        throw physicalDeviceSerialConflict();
      }
      if (isPrismaUniqueViolation(error) && normalized.imei) {
        throw physicalDeviceImeiConflict();
      }
      if (isPrismaUniqueViolation(error, ['idempotencyKey']) && idempotencyKey) {
        const replay = await this.prisma.physicalDeviceAssignment.findUnique({
          where: { idempotencyKey },
          include: { physicalDevice: { include: { assignments: { take: 0 } } } },
        });
        if (replay?.physicalDevice) {
          const storedFingerprint = readAssignmentPayloadFingerprint(replay.metadataJson);
          if (storedFingerprint && storedFingerprint !== payloadFingerprint) {
            throw physicalDeviceIdempotencyPayloadMismatch();
          }
          return this.toListItem({ ...replay.physicalDevice, assignments: [] });
        }
      }
      throw error;
    }
  }

  private toListItem(
    row: {
      id: string;
      internalInventoryNumber: string;
      manufacturer: string;
      modelCode: PhysicalDeviceModelCode;
      serialNumber: string | null;
      imei: string | null;
      ownerOrganizationId: string | null;
      warehouseLocation: string;
      status: PhysicalDeviceInventoryStatus;
      identityStatus: PhysicalDeviceIdentityStatus;
      recordedAt: Date;
      assignments?: Array<{ vehicleId: string | null }>;
    },
  ): PhysicalDeviceListItemDto {
    const currentVehicleId =
      row.assignments?.find((a) => a.vehicleId)?.vehicleId ?? null;
    const installEligible =
      row.identityStatus === PhysicalDeviceIdentityStatus.VERIFIED &&
      row.status === PhysicalDeviceInventoryStatus.AVAILABLE;
    return {
      id: row.id,
      internalInventoryNumber: row.internalInventoryNumber,
      manufacturer: row.manufacturer,
      modelCode: row.modelCode,
      serialNumberMasked: maskDeviceSerial(row.serialNumber),
      imeiMasked: maskDeviceImei(row.imei),
      ownerOrganizationId: row.ownerOrganizationId,
      warehouseLocation: row.warehouseLocation,
      status: row.status,
      identityStatus: row.identityStatus,
      recordedAt: row.recordedAt.toISOString(),
      currentVehicleId,
      installEligible,
    };
  }
}

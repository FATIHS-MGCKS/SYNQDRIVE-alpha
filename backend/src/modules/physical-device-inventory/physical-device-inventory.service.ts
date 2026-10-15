import { Injectable } from '@nestjs/common';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceIntakeSource,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import type { ManualIntakePhysicalDeviceDto } from './dto/manual-intake-physical-device.dto';
import {
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

function normalizeSerial(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

function normalizeImei(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length ? digits : null;
}

function resolveIdentityStatus(input: {
  modelCode: PhysicalDeviceModelCode;
  serialNumber: string | null;
  imei: string | null;
}): PhysicalDeviceIdentityStatus {
  if (!input.serialNumber && !input.imei) {
    return PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION;
  }
  if (input.modelCode === PhysicalDeviceModelCode.RUPTELA_R1 && input.serialNumber) {
    if (!input.serialNumber.startsWith('R1-')) {
      return PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION;
    }
  }
  return PhysicalDeviceIdentityStatus.VERIFIED;
}

function allocateInternalInventoryNumber(): string {
  return `PDI-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

@Injectable()
export class PhysicalDeviceInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listDevices(query: {
    search?: string;
    status?: PhysicalDeviceInventoryStatus;
    modelCode?: PhysicalDeviceModelCode;
    warehouseLocation?: string;
    ownerOrganizationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: PhysicalDeviceListItemDto[]; total: number }> {
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

  async manualIntake(
    dto: ManualIntakePhysicalDeviceDto,
    actorUserId: string | null,
  ): Promise<PhysicalDeviceListItemDto> {
    if (dto.idempotencyKey?.trim()) {
      const existing = await this.prisma.physicalDeviceAssignment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey.trim() },
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
      if (existing?.physicalDevice) {
        return this.toListItem(existing.physicalDevice);
      }
    }

    const serialNumber = normalizeSerial(dto.serialNumber);
    const imei = normalizeImei(dto.imei);
    const ownerOrganizationId = dto.ownerOrganizationId ?? null;

    if (ownerOrganizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: ownerOrganizationId },
        select: { id: true },
      });
      if (!org) {
        throw physicalDeviceOwnerOrgNotFound(ownerOrganizationId);
      }
    }

    const identityStatus = resolveIdentityStatus({
      modelCode: dto.modelCode,
      serialNumber,
      imei,
    });
    const recordedAt = new Date();
    const manufacturer = PHYSICAL_DEVICE_MANUFACTURER_BY_MODEL[dto.modelCode];

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const device = await tx.physicalDevice.create({
          data: {
            internalInventoryNumber: allocateInternalInventoryNumber(),
            manufacturer,
            modelCode: dto.modelCode,
            serialNumber,
            imei,
            ownerOrganizationId,
            warehouseLocation: dto.warehouseLocation.trim(),
            status: PhysicalDeviceInventoryStatus.AVAILABLE,
            identityStatus,
            recordedAt,
            intakeSource: PhysicalDeviceIntakeSource.MANUAL_MASTER_ADMIN,
            identityEvidenceJson: {
              intakeKind: 'MANUAL_MASTER_ADMIN',
              recordedAt: recordedAt.toISOString(),
              actorUserId,
            } as Prisma.InputJsonValue,
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
            idempotencyKey: dto.idempotencyKey?.trim() || null,
            actorUserId,
            metadataJson: {
              warehouseLocation: dto.warehouseLocation.trim(),
              identityStatus,
            } as Prisma.InputJsonValue,
          },
        });

        return device;
      });

      return this.toListItem({ ...created, assignments: [] });
    } catch (error) {
      if (isPrismaUniqueViolation(error, ['serialNumber'])) {
        throw physicalDeviceSerialConflict(serialNumber ?? '');
      }
      if (isPrismaUniqueViolation(error, ['imei'])) {
        throw physicalDeviceImeiConflict(imei ?? '');
      }
      if (isPrismaUniqueViolation(error, ['idempotencyKey']) && dto.idempotencyKey?.trim()) {
        const replay = await this.prisma.physicalDeviceAssignment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey.trim() },
          include: { physicalDevice: { include: { assignments: { take: 0 } } } },
        });
        if (replay?.physicalDevice) {
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
    };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DamageEvidenceStatus,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
  DamageSource,
  DamageStatus,
  Prisma,
  TaskPriority,
} from '@prisma/client';
import { TasksService } from '../../tasks/tasks.service';
import { damageRepairDedupKey } from '../../tasks/automation/task-automation-rule.util';
import type { CreateDamageDto } from './dto/create-damage.dto';
import type { CreateDamageRepairTaskDto } from './dto/create-damage-repair-task.dto';
import type { UpdateDamageDto } from './dto/update-damage.dto';
import type { MarkDamageRepairedDto } from './dto/mark-damage-repaired.dto';
import type { PlaceDamageOnVehicleDto } from './dto/place-damage-on-vehicle.dto';
import {
  buildFleetDamageStats,
  buildVehicleDamageInsights,
  type FleetDamageStatsDto,
} from './damage-analytics';
import {
  buildDamageStats,
  defaultLiabilityForSource,
  defaultRentalImpactForSeverity,
  deriveDamageStatus,
  evidenceStatusFromImageCount,
  isActiveDamage,
  mapDamageImage,
  mapDamageToResponse,
  sortDamagesForList,
  type DamageResponseDto,
  type DamageStatsDto,
} from './damage.mapper';

// Bound base64 damage images stored directly in Postgres (vehicle_damage_images).
// TODO(object-storage): replace inline base64 persistence with object storage keys;
// keep validateImagePayload + extractImageMime as the upload boundary.
const MAX_DAMAGE_IMAGE_BYTES = parseInt(
  process.env.MAX_DAMAGE_IMAGE_BYTES || `${6 * 1024 * 1024}`,
  10,
);
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const DAMAGE_INCLUDE = { images: { orderBy: { createdAt: 'asc' as const } } };

type DamageRow = Prisma.VehicleDamageGetPayload<{ include: typeof DAMAGE_INCLUDE }>;

@Injectable()
export class DamagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  /**
   * Validates a base64 (optionally data-URL) image before it is persisted.
   * Enforces an allowed MIME type and a maximum decoded size.
   */
  validateImagePayload(imageData: string): void {
    if (!imageData || typeof imageData !== 'string') {
      throw new BadRequestException('imageData is required');
    }

    let base64 = imageData;
    const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(imageData);
    if (dataUrlMatch) {
      const mime = dataUrlMatch[1].toLowerCase();
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type "${mime}". Allowed: ${[...ALLOWED_IMAGE_MIME].join(', ')}`,
        );
      }
      base64 = dataUrlMatch[2];
    }

    const len = base64.length;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const bytes = Math.floor((len * 3) / 4) - padding;

    if (bytes > MAX_DAMAGE_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large (${(bytes / 1024 / 1024).toFixed(1)} MB). Max ${(
          MAX_DAMAGE_IMAGE_BYTES /
          1024 /
          1024
        ).toFixed(0)} MB — compress before upload.`,
      );
    }
  }

  extractImageMime(imageData: string): string | null {
    const match = /^data:([^;,]+);base64,/.exec(imageData);
    return match ? match[1].toLowerCase() : null;
  }

  async findByVehicle(vehicleId: string): Promise<DamageResponseDto[]> {
    const rows = await this.prisma.vehicleDamage.findMany({
      where: { vehicleId },
      include: DAMAGE_INCLUDE,
    });
    return sortDamagesForList(rows).map(mapDamageToResponse);
  }

  async findActive(vehicleId: string): Promise<DamageResponseDto[]> {
    const rows = await this.prisma.vehicleDamage.findMany({
      where: {
        vehicleId,
        status: { in: ['OPEN', 'IN_REPAIR'] },
        repairedAt: null,
      },
      include: DAMAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.filter(isActiveDamage).map(mapDamageToResponse);
  }

  async findById(vehicleId: string, damageId: string): Promise<DamageResponseDto> {
    const row = await this.assertDamageBelongsToVehicle(vehicleId, damageId);
    return mapDamageToResponse(row);
  }

  async getStats(vehicleId: string): Promise<DamageStatsDto> {
    const rows = await this.prisma.vehicleDamage.findMany({
      where: { vehicleId },
    });
    const forStats = rows.map((row) => ({ ...row, images: [] }));
    return {
      ...buildDamageStats(forStats),
      insights: buildVehicleDamageInsights(forStats),
    };
  }

  async getFleetStats(organizationId: string): Promise<FleetDamageStatsDto> {
    const rows = await this.prisma.vehicleDamage.findMany({
      where: { vehicle: { organizationId } },
      select: {
        status: true,
        severity: true,
        rentalImpact: true,
        locationView: true,
        estimatedCostCents: true,
        repairCostCents: true,
        chargedToCustomerCents: true,
        repairStartedAt: true,
        repairedAt: true,
        createdAt: true,
        evidenceStatus: true,
        locationX: true,
        locationY: true,
        vehicleId: true,
        bookingId: true,
        customerId: true,
        vehicle: { select: { make: true, model: true } },
      },
    });
    return buildFleetDamageStats(organizationId, rows);
  }

  async create(
    vehicleId: string,
    dto: CreateDamageDto,
    organizationId?: string,
  ): Promise<DamageResponseDto> {
    dto.images?.forEach((img) => this.validateImagePayload(img.imageData));

    const severity = dto.severity ?? DamageSeverity.MINOR;
    const orgId = organizationId ?? (await this.requireVehicleOrganizationId(vehicleId));

    await this.validateForeignKeys(orgId, vehicleId, {
      bookingId: dto.bookingId,
      customerId: dto.customerId,
      handoverProtocolId: dto.handoverProtocolId,
      taskId: dto.taskId,
    });

    const imageCount = dto.images?.length ?? 0;
    const evidenceStatus =
      dto.evidenceStatus ??
      evidenceStatusFromImageCount(imageCount, DamageEvidenceStatus.MISSING);
    const source = dto.source ?? DamageSource.MANUAL;
    const liabilityStatus = dto.liabilityStatus ?? defaultLiabilityForSource(source);

    const row = await this.prisma.vehicleDamage.create({
      data: {
        vehicle: { connect: { id: vehicleId } },
        damageType: dto.damageType,
        severity,
        status: dto.status ?? DamageStatus.OPEN,
        description: dto.description,
        locationView: dto.locationView ?? DamageLocationView.UNKNOWN,
        locationX: dto.locationX,
        locationY: dto.locationY,
        locationLabel: dto.locationLabel,
        estimatedCostCents: dto.estimatedCostCents,
        repairCostCents: dto.repairCostCents,
        chargedToCustomerCents: dto.chargedToCustomerCents,
        depositHoldCents: dto.depositHoldCents,
        source,
        rentalImpact: dto.rentalImpact ?? defaultRentalImpactForSeverity(severity),
        evidenceStatus,
        liabilityStatus,
        liabilityNote: dto.liabilityNote,
        reportedBy: dto.reportedBy,
        ...(dto.bookingId ? { booking: { connect: { id: dto.bookingId } } } : {}),
        ...(dto.customerId ? { customer: { connect: { id: dto.customerId } } } : {}),
        ...(dto.handoverProtocolId
          ? { handoverProtocol: { connect: { id: dto.handoverProtocolId } } }
          : {}),
        ...(dto.taskId ? { task: { connect: { id: dto.taskId } } } : {}),
        ...(imageCount
          ? {
              images: {
                create: dto.images!.map((img) => ({
                  imageData: img.imageData,
                  caption: img.caption,
                  mimeType: this.extractImageMime(img.imageData),
                })),
              },
            }
          : {}),
      },
      include: DAMAGE_INCLUDE,
    });

    return mapDamageToResponse(row);
  }

  async update(
    vehicleId: string,
    damageId: string,
    dto: UpdateDamageDto,
    organizationId?: string,
  ): Promise<DamageResponseDto> {
    await this.assertDamageBelongsToVehicle(vehicleId, damageId);
    const orgId = organizationId ?? (await this.requireVehicleOrganizationId(vehicleId));

    await this.validateForeignKeys(orgId, vehicleId, {
      bookingId: dto.bookingId ?? undefined,
      customerId: dto.customerId ?? undefined,
      handoverProtocolId: dto.handoverProtocolId ?? undefined,
      taskId: dto.taskId ?? undefined,
    });

    const data: Prisma.VehicleDamageUpdateInput = {};

    if (dto.damageType !== undefined) data.damageType = dto.damageType;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.locationView !== undefined) data.locationView = dto.locationView;
    if (dto.locationX !== undefined) data.locationX = dto.locationX;
    if (dto.locationY !== undefined) data.locationY = dto.locationY;
    if (dto.locationLabel !== undefined) data.locationLabel = dto.locationLabel;
    if (dto.estimatedCostCents !== undefined) data.estimatedCostCents = dto.estimatedCostCents;
    if (dto.repairCostCents !== undefined) data.repairCostCents = dto.repairCostCents;
    if (dto.chargedToCustomerCents !== undefined) data.chargedToCustomerCents = dto.chargedToCustomerCents;
    if (dto.depositHoldCents !== undefined) data.depositHoldCents = dto.depositHoldCents;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.rentalImpact !== undefined) data.rentalImpact = dto.rentalImpact;
    if (dto.evidenceStatus !== undefined) data.evidenceStatus = dto.evidenceStatus;
    if (dto.liabilityStatus !== undefined) data.liabilityStatus = dto.liabilityStatus;
    if (dto.liabilityNote !== undefined) data.liabilityNote = dto.liabilityNote;
    if (dto.bookingId !== undefined) {
      data.booking = dto.bookingId ? { connect: { id: dto.bookingId } } : { disconnect: true };
    }
    if (dto.customerId !== undefined) {
      data.customer = dto.customerId ? { connect: { id: dto.customerId } } : { disconnect: true };
    }
    if (dto.handoverProtocolId !== undefined) {
      data.handoverProtocol = dto.handoverProtocolId
        ? { connect: { id: dto.handoverProtocolId } }
        : { disconnect: true };
    }
    if (dto.taskId !== undefined) {
      data.task = dto.taskId ? { connect: { id: dto.taskId } } : { disconnect: true };
    }
    if (dto.repairStartedAt !== undefined) {
      data.repairStartedAt = dto.repairStartedAt ? new Date(dto.repairStartedAt) : null;
      if (dto.repairStartedAt && dto.status === undefined) {
        data.status = DamageStatus.IN_REPAIR;
      }
    }

    const row = await this.prisma.vehicleDamage.update({
      where: { id: damageId },
      data,
      include: DAMAGE_INCLUDE,
    });

    return mapDamageToResponse(row);
  }

  async placeOnVehicle(
    vehicleId: string,
    damageId: string,
    dto: PlaceDamageOnVehicleDto,
  ): Promise<DamageResponseDto> {
    await this.assertDamageBelongsToVehicle(vehicleId, damageId);

    const row = await this.prisma.vehicleDamage.update({
      where: { id: damageId },
      data: {
        locationView: dto.locationView,
        locationX: dto.locationX,
        locationY: dto.locationY,
        locationLabel: dto.locationLabel,
      },
      include: DAMAGE_INCLUDE,
    });

    return mapDamageToResponse(row);
  }

  async markRepaired(
    vehicleId: string,
    damageId: string,
    dto: MarkDamageRepairedDto = {},
  ): Promise<DamageResponseDto> {
    const existing = await this.assertDamageBelongsToVehicle(vehicleId, damageId);

    const description =
      dto.note && existing.description
        ? `${existing.description}\n\n[Repair note] ${dto.note}`
        : dto.note ?? existing.description;

    const row = await this.prisma.vehicleDamage.update({
      where: { id: damageId },
      data: {
        repairedAt: new Date(),
        status: DamageStatus.REPAIRED,
        // After repair, damage no longer blocks rental operations.
        rentalImpact: 'NONE',
        repairCostCents: dto.repairCostCents ?? existing.repairCostCents,
        description,
      },
      include: DAMAGE_INCLUDE,
    });

    return mapDamageToResponse(row);
  }

  async createRepairTask(
    vehicleId: string,
    damageId: string,
    dto: CreateDamageRepairTaskDto = {},
    actorUserId?: string,
  ): Promise<{ damage: DamageResponseDto; taskId: string }> {
    const existing = await this.assertDamageBelongsToVehicle(vehicleId, damageId);
    const orgId = await this.requireVehicleOrganizationId(vehicleId);

    if (existing.taskId) {
      throw new BadRequestException('This damage already has a linked repair task');
    }
    const status = deriveDamageStatus(existing);
    if (status === 'REPAIRED' || status === 'ARCHIVED') {
      throw new BadRequestException('This damage cannot receive a repair task');
    }

    const title = this.buildRepairTaskTitle(existing);
    const description = this.buildRepairTaskDescription(existing, dto.note);
    const priority = this.deriveRepairTaskPriority(existing);
    const blocksVehicleAvailability =
      existing.rentalImpact === 'BLOCK_RENTAL' || existing.rentalImpact === 'SAFETY_CRITICAL';

    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId: orgId },
        select: { id: true },
      });
      if (!vendor) {
        throw new BadRequestException('vendorId does not match organization context');
      }
    }

    const key = damageRepairDedupKey(damageId);
    const task = await this.tasks.upsertByDedup(orgId, key, {
      title,
      description,
      category: 'Repair',
      type: 'REPAIR',
      source: 'MANUAL',
      sourceType: 'MANUAL',
      priority,
      vehicleId,
      vendorId: dto.vendorId ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      blocksVehicleAvailability,
      metadata: {
        generatedKey: key,
        origin: 'DAMAGE',
        damageId,
        rentalImpact: existing.rentalImpact,
        createdByUserId: actorUserId ?? undefined,
        ...(existing.estimatedCostCents != null
          ? { estimatedCostCents: existing.estimatedCostCents }
          : {}),
      },
    });
    const taskId = task.id;

    const row = await this.prisma.vehicleDamage.update({
      where: { id: damageId },
      data: { task: { connect: { id: taskId } } },
      include: DAMAGE_INCLUDE,
    });

    return { damage: mapDamageToResponse(row), taskId };
  }

  private buildRepairTaskTitle(row: DamageRow): string {
    const typeLabel = row.damageType.replace(/_/g, ' ');
    const location =
      row.locationLabel?.trim() ||
      (row.locationView !== 'UNKNOWN' ? row.locationView : null);
    return location ? `Repair: ${typeLabel} - ${location}` : `Repair: ${typeLabel}`;
  }

  private buildRepairTaskDescription(row: DamageRow, extraNote?: string): string {
    const lines = [
      row.description?.trim() || null,
      `Damage ID: ${row.id}`,
      `Severity: ${row.severity}`,
      `Rental impact: ${row.rentalImpact}`,
      `Evidence: ${row.evidenceStatus}`,
      row.estimatedCostCents != null ? `Estimated cost: ${row.estimatedCostCents} cents` : null,
      row.locationView !== 'UNKNOWN'
        ? `Location: ${row.locationView}${row.locationLabel ? ` · ${row.locationLabel}` : ''}`
        : null,
      extraNote?.trim() || null,
    ].filter((line): line is string => Boolean(line));
    return lines.join('\n');
  }

  private deriveRepairTaskPriority(row: Pick<DamageRow, 'rentalImpact' | 'severity'>): TaskPriority {
    switch (row.rentalImpact as DamageRentalImpact) {
      case 'SAFETY_CRITICAL':
        return 'CRITICAL';
      case 'BLOCK_RENTAL':
        return 'HIGH';
      case 'WATCH':
        return 'NORMAL';
      case 'NONE':
      default:
        return row.severity === 'MINOR' ? 'LOW' : 'NORMAL';
    }
  }

  async addImage(
    vehicleId: string,
    damageId: string,
    imageData: string,
    caption?: string,
    uploadedBy?: string,
  ): Promise<DamageResponseDto> {
    this.validateImagePayload(imageData);
    const existing = await this.assertDamageBelongsToVehicle(vehicleId, damageId);

    await this.prisma.vehicleDamageImage.create({
      data: {
        damage: { connect: { id: damageId } },
        imageData,
        caption,
        mimeType: this.extractImageMime(imageData),
        uploadedBy,
      },
    });

    const imageCount = existing.images.length + 1;
    const evidenceStatus = evidenceStatusFromImageCount(imageCount, existing.evidenceStatus);

    const row = await this.prisma.vehicleDamage.update({
      where: { id: damageId },
      data: { evidenceStatus },
      include: DAMAGE_INCLUDE,
    });

    return mapDamageToResponse(row);
  }

  async assertDamageBelongsToVehicle(vehicleId: string, damageId: string): Promise<DamageRow> {
    const row = await this.prisma.vehicleDamage.findFirst({
      where: { id: damageId, vehicleId },
      include: DAMAGE_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Damage ${damageId} not found for vehicle ${vehicleId}`);
    }
    return row;
  }

  private async requireVehicleOrganizationId(vehicleId: string): Promise<string> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }
    return vehicle.organizationId;
  }

  private async validateForeignKeys(
    organizationId: string,
    vehicleId: string,
    refs: {
      bookingId?: string;
      customerId?: string;
      handoverProtocolId?: string;
      taskId?: string;
    },
  ): Promise<void> {
    if (refs.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: refs.bookingId, organizationId, vehicleId },
        select: { id: true },
      });
      if (!booking) {
        throw new BadRequestException('bookingId does not match vehicle/organization context');
      }
    }

    if (refs.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: refs.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException('customerId does not match organization context');
      }
    }

    if (refs.handoverProtocolId) {
      const protocol = await this.prisma.bookingHandoverProtocol.findFirst({
        where: { id: refs.handoverProtocolId, organizationId, vehicleId },
        select: { id: true },
      });
      if (!protocol) {
        throw new BadRequestException('handoverProtocolId does not match vehicle/organization context');
      }
    }

    if (refs.taskId) {
      const task = await this.prisma.orgTask.findFirst({
        where: { id: refs.taskId, organizationId, vehicleId },
        select: { id: true },
      });
      if (!task) {
        throw new BadRequestException('taskId does not match vehicle/organization context');
      }
    }
  }
}

// Re-export mapper helpers used by tests
export { deriveDamageStatus, mapDamageToResponse, mapDamageImage };

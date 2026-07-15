import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ServiceEventOrigin,
  ServiceEventType,
  VehicleServiceEvent,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { ServiceOverdueTaskService } from '../service-compliance/service-overdue-task.service';
import { CreateVehicleServiceEventDto } from './dto/create-vehicle-service-event.dto';
import { UpdateVehicleServiceEventDto } from './dto/update-vehicle-service-event.dto';
import {
  FULL_SERVICE_BASELINE_EVENT_TYPES,
  OIL_CHANGE_EVENT_TYPE,
  SERVICE_HISTORY_EVENT_TYPES,
} from './service-events.constants';

export interface ServiceEventMutationContext {
  userId?: string | null;
  origin?: ServiceEventOrigin;
}

@Injectable()
export class ServiceEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceOverdueTasks: ServiceOverdueTaskService,
  ) {}

  async findByVehicle(
    vehicleId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<VehicleServiceEvent>> {
    const { skip, take } = parsePagination(params || {});
    const where = { vehicleId };
    const [data, total] = await Promise.all([
      this.prisma.vehicleServiceEvent.findMany({
        where,
        skip,
        take,
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.vehicleServiceEvent.count({ where }),
    ]);
    return buildPaginatedResult(data, total, params || {});
  }

  async create(
    vehicleId: string,
    dto: CreateVehicleServiceEventDto,
    ctx: ServiceEventMutationContext = {},
  ): Promise<VehicleServiceEvent> {
    const eventDate = new Date(dto.eventDate);
    const created = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: dto.eventType,
        eventDate,
        odometerKm: dto.odometerKm ?? null,
        notes: dto.notes?.trim() || null,
        workshopName: dto.workshopName?.trim() || null,
        costCents: dto.costCents ?? null,
        provider: dto.provider?.trim() || null,
        documentUrl: dto.documentUrl ?? null,
        origin: ctx.origin ?? dto.origin ?? ServiceEventOrigin.MANUAL,
        createdById: ctx.userId ?? null,
        updatedById: ctx.userId ?? null,
      },
    });

    await this.refreshVehicleHistoryDenorm(vehicleId);
    await this.notifyServiceOverdueAfterHistoryChange(vehicleId, dto.eventType);
    return created;
  }

  async update(
    vehicleId: string,
    id: string,
    dto: UpdateVehicleServiceEventDto,
    ctx: ServiceEventMutationContext = {},
  ): Promise<VehicleServiceEvent> {
    const existing = await this.prisma.vehicleServiceEvent.findFirst({
      where: { id, vehicleId },
    });
    if (!existing) {
      throw new NotFoundException(`Service event ${id} not found for vehicle ${vehicleId}`);
    }

    const data: Record<string, unknown> = {};
    if (dto.eventType !== undefined) data.eventType = dto.eventType;
    if (dto.eventDate !== undefined) data.eventDate = new Date(dto.eventDate);
    if (dto.odometerKm !== undefined) data.odometerKm = dto.odometerKm;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.workshopName !== undefined) data.workshopName = dto.workshopName?.trim() || null;
    if (dto.costCents !== undefined) data.costCents = dto.costCents;
    if (dto.provider !== undefined) data.provider = dto.provider?.trim() || null;
    if (dto.documentUrl !== undefined) data.documentUrl = dto.documentUrl;
    if (dto.origin !== undefined) data.origin = dto.origin;
    if (ctx.userId) data.updatedById = ctx.userId;

    const updated = await this.prisma.vehicleServiceEvent.update({
      where: { id: existing.id },
      data,
    });

    await this.refreshVehicleHistoryDenorm(vehicleId);
    await this.notifyServiceOverdueAfterHistoryChange(vehicleId, updated.eventType);
    return updated;
  }

  async remove(vehicleId: string, id: string): Promise<void> {
    const result = await this.prisma.vehicleServiceEvent.deleteMany({
      where: { id, vehicleId },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Service event ${id} not found for vehicle ${vehicleId}`);
    }
    await this.refreshVehicleHistoryDenorm(vehicleId);
  }

  /**
   * Recomputes denormalized vehicle history fields from events.
   * Never touches next-service intervals, nextServiceDueDate, or HM-derived truth.
   */
  async refreshVehicleHistoryDenorm(vehicleId: string): Promise<void> {
    const [latestFullService, latestOilChange] = await Promise.all([
      this.prisma.vehicleServiceEvent.findFirst({
        where: {
          vehicleId,
          eventType: { in: FULL_SERVICE_BASELINE_EVENT_TYPES },
        },
        orderBy: { eventDate: 'desc' },
        select: { eventDate: true, odometerKm: true },
      }),
      this.prisma.vehicleServiceEvent.findFirst({
        where: { vehicleId, eventType: OIL_CHANGE_EVENT_TYPE },
        orderBy: { eventDate: 'desc' },
        select: { eventDate: true, odometerKm: true },
      }),
    ]);

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastServiceDate: latestFullService?.eventDate ?? null,
        lastServiceOdometerKm: latestFullService?.odometerKm ?? null,
        lastOilChangeDate: latestOilChange?.eventDate ?? null,
        lastOilChangeOdometerKm: latestOilChange?.odometerKm ?? null,
      },
    });
  }

  /** Count any documented service history row (incl. REPAIR) — not next-service truth. */
  async hasAnyServiceHistory(vehicleId: string): Promise<boolean> {
    const count = await this.prisma.vehicleServiceEvent.count({
      where: {
        vehicleId,
        eventType: { in: SERVICE_HISTORY_EVENT_TYPES },
      },
    });
    return count > 0;
  }

  private async notifyServiceOverdueAfterHistoryChange(
    vehicleId: string,
    eventType: ServiceEventType,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        organizationId: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
        mileageKm: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
      },
    });
    if (!vehicle) return;

    void this.serviceOverdueTasks
      .onServiceHistoryChanged(
        vehicle.organizationId,
        {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          licensePlate: vehicle.licensePlate,
          homeStationId: vehicle.homeStationId,
          mileageKm: vehicle.mileageKm,
          lastServiceDate: vehicle.lastServiceDate,
          lastServiceOdometerKm: vehicle.lastServiceOdometerKm,
          serviceIntervalManufacturerKm: vehicle.serviceIntervalManufacturerKm,
          serviceIntervalManufacturerMonths: vehicle.serviceIntervalManufacturerMonths,
        },
        eventType,
      )
      .catch(() => {});
  }
}

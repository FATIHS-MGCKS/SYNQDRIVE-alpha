import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import {
  STATION_VEHICLE_WORKFLOW_DEFAULT_PAGE_SIZE,
  STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE,
  type StationVehicleWorkflowStationRef,
  type StationVehicleWorkflowVehicleLookupResult,
  type StationVehicleWorkflowVehicleRow,
} from '@shared/stations/station-vehicle-workflow.contract';
import type { ListStationVehicleWorkflowVehiclesQueryDto } from './dto/list-station-vehicle-workflow-vehicles-query.dto';

@Injectable()
export class StationVehicleWorkflowLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  async lookupVehicles(
    organizationId: string,
    query: ListStationVehicleWorkflowVehiclesQueryDto,
    scope?: StationScopeContext,
  ): Promise<StationVehicleWorkflowVehicleLookupResult> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const page = query.page ?? 1;
    const pageSize = Math.min(
      query.pageSize ?? STATION_VEHICLE_WORKFLOW_DEFAULT_PAGE_SIZE,
      STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE,
    );
    const search = query.search?.trim() ?? '';

    if (query.contextStationId) {
      await this.stationAccessScope.requireReadableStation(access, query.contextStationId, {
        select: { id: true, organizationId: true },
      });
    }

    const where: Prisma.VehicleWhereInput = {
      ...this.stationAccessScope.buildFleetVehicleWhere(access),
    };

    if (query.homeAtContextOnly && query.contextStationId) {
      where.homeStationId = query.contextStationId;
    }

    if (search) {
      where.OR = [
        { licensePlate: { contains: search, mode: 'insensitive' } },
        { vehicleName: { contains: search, mode: 'insensitive' } },
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, vehicles] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }, { model: 'asc' }],
        select: {
          id: true,
          licensePlate: true,
          make: true,
          model: true,
          vehicleName: true,
          status: true,
          homeStationId: true,
          currentStationId: true,
          expectedStationId: true,
          stationPositionVersion: true,
        },
      }),
    ]);

    const stationIds = new Set<string>();
    for (const row of vehicles) {
      if (row.homeStationId) stationIds.add(row.homeStationId);
      if (row.currentStationId) stationIds.add(row.currentStationId);
      if (row.expectedStationId) stationIds.add(row.expectedStationId);
    }

    const stationDirectory = await this.loadStationDirectory(organizationId, [...stationIds]);

    return {
      version: 1,
      organizationId,
      contextStationId: query.contextStationId ?? null,
      search: search || null,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      vehicles: vehicles.map((row) => this.toVehicleRow(row, stationDirectory)),
      frontendRecomputation: false,
    };
  }

  async requireVehicleInScope(
    organizationId: string,
    vehicleId: string,
    scope?: StationScopeContext,
  ) {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ...this.stationAccessScope.buildFleetVehicleWhere(access),
      },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        vehicleName: true,
        status: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        expectedStationSource: true,
        stationPositionVersion: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return vehicle;
  }

  private async loadStationDirectory(
    organizationId: string,
    stationIds: string[],
  ): Promise<Map<string, StationVehicleWorkflowStationRef>> {
    if (!stationIds.length) {
      return new Map();
    }

    const stations = await this.prisma.station.findMany({
      where: { organizationId, id: { in: stationIds } },
      select: { id: true, name: true, code: true, status: true },
    });

    return new Map(
      stations.map((station) => [
        station.id,
        {
          id: station.id,
          name: station.name,
          code: station.code,
          status: station.status,
        },
      ]),
    );
  }

  private toVehicleRow(
    row: {
      id: string;
      licensePlate: string | null;
      make: string;
      model: string;
      vehicleName: string | null;
      status: string;
      homeStationId: string | null;
      currentStationId: string | null;
      expectedStationId: string | null;
      stationPositionVersion: number;
    },
    stationDirectory: Map<string, StationVehicleWorkflowStationRef>,
  ): StationVehicleWorkflowVehicleRow {
    return {
      id: row.id,
      licensePlate: row.licensePlate,
      make: row.make,
      model: row.model,
      vehicleName: row.vehicleName,
      rentalStatus: row.status,
      homeStation: row.homeStationId ? stationDirectory.get(row.homeStationId) ?? null : null,
      currentStation: row.currentStationId
        ? stationDirectory.get(row.currentStationId) ?? null
        : null,
      expectedStation: row.expectedStationId
        ? stationDirectory.get(row.expectedStationId) ?? null
        : null,
      stationPositionVersion: row.stationPositionVersion,
      isRented: row.status === 'RENTED',
    };
  }
}

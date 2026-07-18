import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import {
  getStationFleetContractMetadata,
  StationFleetGroupKey,
  type StationFleetReadModel,
} from '@shared/stations/station-fleet-read-model.contract';
import { resolveStationFleetReadModel } from '@shared/stations/station-fleet-read-model.resolver';
import type { ListStationFleetQueryDto } from './dto/list-station-fleet-query.dto';

@Injectable()
export class StationFleetReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  getContractMetadata() {
    return getStationFleetContractMetadata();
  }

  async resolveForStation(
    organizationId: string,
    stationId: string,
    query: ListStationFleetQueryDto = {},
    scope?: StationScopeContext,
  ): Promise<StationFleetReadModel> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true, organizationId: true },
    });

    const vehicles = await this.prisma.vehicle.findMany({
      where: this.stationAccessScope.buildStationFleetWhere(access, stationId),
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        currentStationSource: true,
        currentStationConfirmedAt: true,
      },
      orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }, { model: 'asc' }],
    });

    const stationIds = new Set<string>();
    for (const row of vehicles) {
      if (row.homeStationId) stationIds.add(row.homeStationId);
      if (row.currentStationId) stationIds.add(row.currentStationId);
      if (row.expectedStationId) stationIds.add(row.expectedStationId);
    }

    const stations = stationIds.size
      ? await this.prisma.station.findMany({
          where: {
            organizationId,
            id: { in: [...stationIds] },
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
        })
      : [];

    const stationDirectory = new Map(
      stations.map((station) => [
        station.id,
        {
          id: station.id,
          name: station.name,
          code: station.code,
        },
      ]),
    );

    const groupFilter =
      query.group && Object.values(StationFleetGroupKey).includes(query.group)
        ? query.group
        : null;

    return resolveStationFleetReadModel({
      organizationId,
      stationId,
      evaluatedAt: new Date().toISOString(),
      vehicles,
      stationDirectory,
      search: query.search ?? null,
      groupFilter,
      page: query.page,
      pageSize: query.pageSize,
      scopeApplied: access.mode !== STATION_SCOPE_MODE.ALL_STATIONS,
    });
  }
}

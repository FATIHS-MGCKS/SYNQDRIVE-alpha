import { Injectable, Optional } from '@nestjs/common';
import { FleetHealthObservabilityService } from '@modules/fleet-health-observability/fleet-health-observability.service';
import { Prisma, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import type { StationAccessContext } from '@shared/stations/station-access.types';
import type { FleetRentalHealthQueryDto } from './dto/fleet-rental-health-query.dto';
import {
  buildFleetRentalHealthCursorWhere,
  buildFleetRentalHealthOrderBy,
  decodeFleetRentalHealthCursor,
  encodeFleetRentalHealthCursorFromVehicle,
  type FleetRentalHealthPageResult,
  resolveFleetRentalHealthLimit,
} from './rental-health-fleet-cursor.util';
import { RentalHealthSummaryService } from './rental-health-summary.service';
import type { FleetVehicleHealthRow } from './rental-health-summary.types';
import type { HealthState } from './rental-health.types';

export interface FleetRentalHealthListFilters {
  stationId?: string;
  search?: string;
  vehicleStatus?: VehicleStatus;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class RentalHealthFleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealthSummary: RentalHealthSummaryService,
    private readonly stationAccess: StationAccessService,
    @Optional() private readonly fleetHealthObservability?: FleetHealthObservabilityService,
  ) {}

  async listFleetHealthPage(
    orgId: string,
    userId: string | undefined,
    query: FleetRentalHealthQueryDto,
  ): Promise<FleetRentalHealthPageResult<FleetVehicleHealthRow>> {
    const started = performance.now();
    try {
      const result = await this.listFleetHealthPageInternal(orgId, userId, query);
      this.fleetHealthObservability?.recordFleetRows(result.data, 'fleet_page');
      this.fleetHealthObservability?.observeFleetSummary(
        'page',
        'success',
        (performance.now() - started) / 1000,
      );
      return result;
    } catch (err) {
      this.fleetHealthObservability?.observeFleetSummary(
        'page',
        'error',
        (performance.now() - started) / 1000,
      );
      throw err;
    }
  }

  private async listFleetHealthPageInternal(
    orgId: string,
    userId: string | undefined,
    query: FleetRentalHealthQueryDto,
  ): Promise<FleetRentalHealthPageResult<FleetVehicleHealthRow>> {
    const access = await this.stationAccess.resolve(userId, orgId);
    const filters: FleetRentalHealthListFilters = {
      stationId: query.stationId,
      search: query.search,
      vehicleStatus: query.vehicleStatus,
      limit: query.limit,
      cursor: query.cursor,
    };

    const baseWhere = this.buildVehicleSelectionWhere(orgId, access, filters);
    const limit = resolveFleetRentalHealthLimit(filters.limit);
    const cursor = filters.cursor?.trim() || undefined;

    const andFilters: Prisma.VehicleWhereInput[] = [];
    if (cursor) {
      andFilters.push(buildFleetRentalHealthCursorWhere(decodeFleetRentalHealthCursor(cursor)));
    }

    const mergedWhere: Prisma.VehicleWhereInput =
      andFilters.length > 0 ? { AND: [baseWhere, ...andFilters] } : baseWhere;

    const [totalSelected, byStatusRaw, vehicleRows] = await Promise.all([
      this.prisma.vehicle.count({ where: baseWhere }),
      this.prisma.vehicle.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.vehicle.findMany({
        where: mergedWhere,
        select: { id: true, licensePlate: true },
        orderBy: buildFleetRentalHealthOrderBy(),
        take: limit + 1,
      }),
    ]);

    let nextCursor: string | null = null;
    const pageRows =
      vehicleRows.length > limit
        ? (() => {
            nextCursor = encodeFleetRentalHealthCursorFromVehicle(vehicleRows[limit - 1]!);
            return vehicleRows.slice(0, limit);
          })()
        : vehicleRows;

    const data = await this.rentalHealthSummary.getFleetRowsBatch(
      orgId,
      pageRows.map((row) => row.id),
    );

    const byVehicleStatus = Object.fromEntries(
      byStatusRaw.map((row) => [row.status, row._count._all]),
    ) as Partial<Record<VehicleStatus, number>>;

    const pageHealth = this.summarizePageHealth(data);

    return {
      summary: {
        availability: {
          totalSelected,
          byVehicleStatus,
          semantics: 'vehicle_status_operational_vs_rental_health_per_row',
        },
        pageHealth,
      },
      data,
      meta: {
        limit,
        nextCursor,
      },
    };
  }

  buildVehicleSelectionWhere(
    orgId: string,
    access: StationAccessContext,
    filters: FleetRentalHealthListFilters,
  ): Prisma.VehicleWhereInput {
    const andFilters: Prisma.VehicleWhereInput[] = [
      { organizationId: orgId },
      this.stationAccess.buildVehicleStationScopeWhere(access),
    ];

    if (filters.stationId === 'no-station') {
      andFilters.push({ homeStationId: null, currentStationId: null });
    } else if (filters.stationId) {
      this.stationAccess.assertStationReadable(access, filters.stationId);
      andFilters.push({
        OR: [{ homeStationId: filters.stationId }, { currentStationId: filters.stationId }],
      });
    }

    if (filters.vehicleStatus) {
      andFilters.push({ status: filters.vehicleStatus });
    }

    if (filters.search) {
      const search = filters.search.trim();
      andFilters.push({
        OR: [
          { licensePlate: { contains: search, mode: 'insensitive' } },
          { vin: { contains: search, mode: 'insensitive' } },
          { make: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { vehicleName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: andFilters };
  }

  private summarizePageHealth(rows: FleetVehicleHealthRow[]) {
    const byOverallState: Partial<Record<HealthState, number>> = {};
    let rentalBlocked = 0;

    for (const row of rows) {
      byOverallState[row.overall_state] = (byOverallState[row.overall_state] ?? 0) + 1;
      if (row.rental_blocked) rentalBlocked++;
    }

    return {
      rentalBlocked,
      byOverallState,
      vehiclesWithDetail: rows.length,
    };
  }
}

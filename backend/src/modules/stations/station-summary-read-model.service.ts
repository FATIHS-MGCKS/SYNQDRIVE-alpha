import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { ACTIVE_STATION_KPI_BOOKING_STATUSES } from '@shared/stations/station-kpis.contract';
import {
  getStationOrgSummariesContractMetadata,
  normalizeStationOrgSummariesPageSize,
  resolveStationOrgSummariesReadModel,
  type StationOrgSummariesReadModel,
} from '@shared/stations/station-org-summaries.resolver';
import {
  assembleStationSummaryFromLoadRow,
  bookingLinksToStation,
  countOpenTasksForStation,
  filterBookingsForStation,
  filterTransfersForStation,
  filterVehiclesForStation,
  stationSummaryLoadInclude,
  transferLinksToStation,
  type StationSummaryBookingRow,
  type StationSummaryLoadRow,
  type StationSummaryOpenTaskRow,
  type StationSummaryVehicleRow,
  vehicleLinksToStation,
} from '@shared/stations/station-summary-read-model.assembly';
import {
  getStationSummaryReadModelContractMetadata,
  type StationSummaryReadModel,
} from '@shared/stations/station-summary-read-model.resolver';
import { STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS } from '@shared/stations/station-org-summaries.contract';
import { ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES } from './vehicle-station-transfer.types';
import type { ListStationSummariesQueryDto } from './dto/list-station-summaries-query.dto';

@Injectable()
export class StationSummaryReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  getContractMetadata() {
    return getStationSummaryReadModelContractMetadata();
  }

  getOrgSummariesContractMetadata() {
    return getStationOrgSummariesContractMetadata();
  }

  async resolveForStation(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
    options: { at?: string } = {},
  ): Promise<StationSummaryReadModel> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const evaluatedAt = options.at ?? new Date().toISOString();

    const station = (await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        ...this.stationSelect(),
        calendarExceptions: stationSummaryLoadInclude.calendarExceptions,
      },
    })) as unknown as StationSummaryLoadRow;

    const [vehicles, bookings, transfers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: this.stationAccessScope.buildStationLinkedVehicleWhere(access, stationId),
        select: this.vehicleSelect(),
      }),
      this.prisma.booking.findMany({
        where: this.stationAccessScope.buildStationBookingsWhere(access, stationId, {
          status: { in: [...ACTIVE_STATION_KPI_BOOKING_STATUSES] },
        }),
        select: this.bookingSelect(),
      }),
      this.prisma.vehicleStationTransfer.findMany({
        where: {
          organizationId,
          status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
          OR: [{ fromStationId: stationId }, { toStationId: stationId }],
        },
        select: this.transferSelect(),
      }),
    ]);

    const openOperationalTasksCount = await this.prisma.orgTask.count({
      where: this.stationAccessScope.buildStationOpenTasksWhere(
        access,
        stationId,
        vehicles.map((vehicle) => vehicle.id),
        bookings.map((booking) => booking.id),
      ),
    });

    return assembleStationSummaryFromLoadRow(
      station,
      vehicles,
      bookings,
      transfers,
      openOperationalTasksCount,
      evaluatedAt,
      access,
    );
  }

  async resolveForOrganization(
    organizationId: string,
    query: ListStationSummariesQueryDto = {},
    scope?: StationScopeContext,
    options: { at?: string } = {},
  ): Promise<StationOrgSummariesReadModel> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const evaluatedAt = options.at ?? new Date().toISOString();
    const { pageSize, pageSizeCapped } = normalizeStationOrgSummariesPageSize(query.pageSize);
    const page = query.page != null && query.page > 0 ? query.page : 1;

    const extra: Prisma.StationWhereInput = {};
    if (query.status) extra.status = query.status;
    if (query.type) extra.type = query.type;
    if (query.isPrimary != null) extra.isPrimary = query.isPrimary;
    if (query.search) {
      const search = query.search.trim();
      if (search) {
        extra.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
          { postalCode: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const where = this.stationAccessScope.buildStationWhere(access, extra);
    const matchedStationCount = await this.prisma.station.count({ where });

    const stations = (await this.prisma.station.findMany({
      where,
      select: {
        ...this.stationSelect(),
        calendarExceptions: stationSummaryLoadInclude.calendarExceptions,
      },
      orderBy: [{ isPrimary: 'desc' }, { status: 'asc' }, { name: 'asc' }],
      take: STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS,
    })) as unknown as StationSummaryLoadRow[];

    const aggregationStationCapApplied =
      matchedStationCount > STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS;
    const processedStationCount = stations.length;
    const stationIds = stations.map((station) => station.id);

    const summaries =
      stationIds.length === 0
        ? []
        : await this.buildSummariesForStations(
            organizationId,
            access,
            stations,
            stationIds,
            evaluatedAt,
          );

    const scopeApplied = access.mode !== STATION_SCOPE_MODE.ALL_STATIONS;

    return resolveStationOrgSummariesReadModel({
      organizationId,
      evaluatedAt,
      scope: {
        applied: scopeApplied,
        mode: scopeApplied ? 'SCOPED_STATIONS' : 'ALL_STATIONS',
      },
      filters: {
        status: query.status ?? null,
        type: query.type ?? null,
        isPrimary: query.isPrimary ?? null,
        search: query.search?.trim() || null,
        pickupCapabilityAvailable: query.pickupCapabilityAvailable ?? null,
        returnCapabilityAvailable: query.returnCapabilityAvailable ?? null,
        hasConfigurationProblems: query.hasConfigurationProblems ?? null,
      },
      summaries,
      page,
      pageSize,
      matchedStationCount,
      processedStationCount,
      aggregationStationCapApplied,
      pageSizeCapped,
    });
  }

  private async buildSummariesForStations(
    organizationId: string,
    access: ReturnType<StationAccessScopeService['resolveFromContextOrEmpty']>,
    stations: StationSummaryLoadRow[],
    stationIds: string[],
    evaluatedAt: string,
  ): Promise<StationSummaryReadModel[]> {
    const [vehicles, bookings, transfers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: {
          organizationId,
          OR: [
            { homeStationId: { in: stationIds } },
            { currentStationId: { in: stationIds } },
            { expectedStationId: { in: stationIds } },
          ],
        },
        select: this.vehicleSelect(),
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId,
          status: { in: [...ACTIVE_STATION_KPI_BOOKING_STATUSES] },
          OR: [
            { pickupStationId: { in: stationIds } },
            { returnStationId: { in: stationIds } },
          ],
        },
        select: this.bookingSelect(),
      }),
      this.prisma.vehicleStationTransfer.findMany({
        where: {
          organizationId,
          status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
          OR: [
            { fromStationId: { in: stationIds } },
            { toStationId: { in: stationIds } },
          ],
        },
        select: this.transferSelect(),
      }),
    ]);

    const scopedOpenTasks = await this.loadOpenTasksForStations(
      organizationId,
      stationIds,
      vehicles,
      bookings,
    );

    return stations.map((station) => {
      const stationVehicles = filterVehiclesForStation(vehicles, station.id);
      const stationBookings = filterBookingsForStation(bookings, station.id);
      const stationTransfers = filterTransfersForStation(transfers, station.id);
      const vehicleIds = new Set(stationVehicles.map((vehicle) => vehicle.id));
      const bookingIds = new Set(stationBookings.map((booking) => booking.id));
      const openOperationalTasksCount = countOpenTasksForStation(
        scopedOpenTasks,
        station.id,
        vehicleIds,
        bookingIds,
      );

      return assembleStationSummaryFromLoadRow(
        station,
        stationVehicles,
        stationBookings,
        stationTransfers,
        openOperationalTasksCount,
        evaluatedAt,
        access,
      );
    });
  }

  private async loadOpenTasksForStations(
    organizationId: string,
    stationIds: string[],
    vehicles: StationSummaryVehicleRow[],
    bookings: StationSummaryBookingRow[],
  ): Promise<StationSummaryOpenTaskRow[]> {
    const linkedVehicleIds = [
      ...new Set(
        vehicles
          .filter((vehicle) =>
            stationIds.some((stationId) => vehicleLinksToStation(vehicle, stationId)),
          )
          .map((vehicle) => vehicle.id),
      ),
    ];
    const linkedBookingIds = [
      ...new Set(
        bookings
          .filter((booking) =>
            stationIds.some((stationId) => bookingLinksToStation(booking, stationId)),
          )
          .map((booking) => booking.id),
      ),
    ];

    const orFilters: Prisma.OrgTaskWhereInput[] = stationIds.map((stationId) => ({
      metadata: { path: ['stationId'], equals: stationId },
    }));
    if (linkedVehicleIds.length > 0) {
      orFilters.push({ vehicleId: { in: linkedVehicleIds } });
    }
    if (linkedBookingIds.length > 0) {
      orFilters.push({ bookingId: { in: linkedBookingIds } });
    }

    return this.prisma.orgTask.findMany({
      where: {
        organizationId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        OR: orFilters,
      },
      select: this.openTaskSelect(),
    });
  }

  private stationSelect() {
    return {
      id: true,
      organizationId: true,
      name: true,
      code: true,
      status: true,
      type: true,
      isPrimary: true,
      address: true,
      addressLine2: true,
      city: true,
      postalCode: true,
      country: true,
      phone: true,
      email: true,
      managerName: true,
      timezone: true,
      capacity: true,
      archivedAt: true,
      pickupEnabled: true,
      returnEnabled: true,
      afterHoursReturnEnabled: true,
      keyBoxAvailable: true,
      openingHours: true,
      holidayRules: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
    } as const;
  }

  private vehicleSelect() {
    return {
      id: true,
      homeStationId: true,
      currentStationId: true,
      expectedStationId: true,
      status: true,
    } as const;
  }

  private bookingSelect() {
    return {
      id: true,
      status: true,
      pickupStationId: true,
      returnStationId: true,
      startDate: true,
      endDate: true,
    } as const;
  }

  private transferSelect() {
    return {
      id: true,
      fromStationId: true,
      toStationId: true,
      status: true,
    } as const;
  }

  private openTaskSelect() {
    return {
      id: true,
      vehicleId: true,
      bookingId: true,
      metadata: true,
    } as const;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { StationCalendarExceptionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { ACTIVE_STATION_KPI_BOOKING_STATUSES } from '@shared/stations/station-kpis.contract';
import { resolveStationKpis } from '@shared/stations/station-kpis.resolver';
import {
  resolveStationOperations,
  type StationOperationsSnapshot,
} from '@shared/stations/station-operations.resolver';
import { StationOperationalCalendarExceptionInput } from '@shared/stations/station-operational-capability.resolver';
import {
  getStationSummaryReadModelContractMetadata,
  resolveStationSummaryReadModel,
  type StationSummaryReadModel,
} from '@shared/stations/station-summary-read-model.resolver';
import { ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES } from './vehicle-station-transfer.types';
import { STATION_STATUS_LABELS, STATION_TYPE_LABELS } from './station.types';

type StationSummaryLoadRow = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  status: import('@prisma/client').StationStatus;
  type: import('@prisma/client').StationType;
  isPrimary: boolean;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  timezone: string | null;
  capacity: number | null;
  archivedAt: Date | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  openingHours: unknown;
  holidayRules: unknown;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  calendarExceptions: Array<{
    id: string;
    type: import('@prisma/client').StationCalendarExceptionType;
    title: string;
    recurrenceKind: import('@prisma/client').StationCalendarRecurrenceKind;
    calendarDate: Date | null;
    monthDay: string | null;
    closedAllDay: boolean;
    slots: unknown;
    regionCode: string | null;
    priority: number;
    source: import('@prisma/client').StationCalendarExceptionSource;
  }>;
};

@Injectable()
export class StationSummaryReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  getContractMetadata() {
    return getStationSummaryReadModelContractMetadata();
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
        calendarExceptions: {
          where: { status: StationCalendarExceptionStatus.ACTIVE },
          orderBy: [{ priority: 'desc' }, { calendarDate: 'asc' }],
        },
      },
    })) as unknown as StationSummaryLoadRow;

    const vehicleWhere = this.stationAccessScope.buildStationLinkedVehicleWhere(access, stationId);
    const bookingWhere = this.stationAccessScope.buildStationBookingsWhere(access, stationId, {
      status: { in: [...ACTIVE_STATION_KPI_BOOKING_STATUSES] },
    });

    const [vehicles, bookings, transfers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: vehicleWhere,
        select: {
          id: true,
          homeStationId: true,
          currentStationId: true,
          expectedStationId: true,
          status: true,
        },
      }),
      this.prisma.booking.findMany({
        where: bookingWhere,
        select: {
          id: true,
          status: true,
          pickupStationId: true,
          returnStationId: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.vehicleStationTransfer.findMany({
        where: {
          organizationId,
          status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
          OR: [{ fromStationId: stationId }, { toStationId: stationId }],
        },
        select: {
          id: true,
          fromStationId: true,
          toStationId: true,
          status: true,
        },
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

    const calendarExceptions: StationOperationalCalendarExceptionInput[] =
      station.calendarExceptions.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        recurrenceKind: row.recurrenceKind,
        calendarDate: row.calendarDate?.toISOString().slice(0, 10) ?? null,
        monthDay: row.monthDay,
        closedAllDay: row.closedAllDay,
        slots: (row.slots as StationOperationalCalendarExceptionInput['slots']) ?? null,
        regionCode: row.regionCode,
        priority: row.priority,
        source: row.source,
      }));

    const operationsSnapshot: StationOperationsSnapshot = {
      stationId: station.id,
      organizationId: station.organizationId,
      status: station.status,
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      afterHoursReturnEnabled: station.afterHoursReturnEnabled,
      keyBoxAvailable: station.keyBoxAvailable,
      timezone: station.timezone,
      openingHours: station.openingHours,
      legacyHolidayRules: station.holidayRules,
      calendarExceptions,
      temporaryOperationalRules: [],
      latitude: station.latitude,
      longitude: station.longitude,
      radiusMeters: station.radiusMeters,
      capacity: station.capacity,
      vehicles,
    };

    if (!operationsSnapshot.stationId) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    const operations = resolveStationOperations(operationsSnapshot, { at: evaluatedAt });
    const timezone = station.timezone?.trim() || 'Europe/Berlin';

    const kpis = resolveStationKpis({
      stationId,
      timezone,
      evaluatedAt,
      configuredCapacity: station.capacity,
      scope: {
        applied: access.mode !== STATION_SCOPE_MODE.ALL_STATIONS,
        mode:
          access.mode === STATION_SCOPE_MODE.ALL_STATIONS
            ? 'ALL_STATIONS'
            : 'SCOPED_STATIONS',
        stationId,
      },
      vehicles,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        pickupStationId: booking.pickupStationId,
        returnStationId: booking.returnStationId,
        startDate: booking.startDate.toISOString(),
        endDate: booking.endDate.toISOString(),
      })),
      transfers,
      openOperationalTasksCount,
    });

    return resolveStationSummaryReadModel({
      evaluatedAt,
      masterData: {
        id: station.id,
        organizationId: station.organizationId,
        name: station.name,
        code: station.code,
        address: station.address,
        addressLine2: station.addressLine2,
        city: station.city,
        postalCode: station.postalCode,
        country: station.country,
        phone: station.phone,
        email: station.email,
        managerName: station.managerName,
        timezone,
        capacity: station.capacity,
      },
      lifecycle: {
        status: station.status,
        statusLabel: STATION_STATUS_LABELS[station.status],
        type: station.type,
        typeLabel: STATION_TYPE_LABELS[station.type],
        isPrimary: station.isPrimary,
        archived: station.status === 'ARCHIVED',
        archivedAt: station.archivedAt?.toISOString() ?? null,
      },
      operations,
      kpis,
      scope: kpis.scope,
    });
  }
}

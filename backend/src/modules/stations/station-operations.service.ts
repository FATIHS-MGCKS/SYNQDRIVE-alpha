import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationCalendarExceptionStatus } from '@prisma/client';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import {
  getStationOperationsMetadata,
  resolveStationOperations,
  StationOperationsDto,
} from '@shared/stations/station-operations.resolver';
import { StationOperationalCalendarExceptionInput } from '@shared/stations/station-operational-capability.resolver';

type StationOperationsLoadRow = {
  id: string;
  organizationId: string;
  status: import('@prisma/client').StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  timezone: string | null;
  openingHours: unknown;
  holidayRules: unknown;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  capacity: number | null;
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
export class StationOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  getContractMetadata() {
    return getStationOperationsMetadata();
  }

  async resolveForStation(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
    options: { at?: string } = {},
  ): Promise<StationOperationsDto> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = (await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        status: true,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        timezone: true,
        openingHours: true,
        holidayRules: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
        capacity: true,
        calendarExceptions: {
          where: { status: StationCalendarExceptionStatus.ACTIVE },
          orderBy: [{ priority: 'desc' }, { calendarDate: 'asc' }],
        },
      },
    })) as unknown as StationOperationsLoadRow;

    const vehicles = await this.prisma.vehicle.findMany({
      where: this.stationAccessScope.buildStationLinkedVehicleWhere(access, stationId),
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        status: true,
      },
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

    const snapshot = {
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

    if (!snapshot.stationId) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    return resolveStationOperations(snapshot, { at: options.at });
  }
}

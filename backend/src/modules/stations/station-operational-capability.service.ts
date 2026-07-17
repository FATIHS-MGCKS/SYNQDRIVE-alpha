import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationCalendarExceptionStatus } from '@prisma/client';
import {
  getStationOperationalCapabilityMetadata,
  resolveStationOperationalCapabilities,
  resolveStationOperationalCapability,
  StationOperationalCapabilityResolverResult,
  StationOperationalCapabilityEvaluation,
  StationOperationalCalendarExceptionInput,
} from '@shared/stations/station-operational-capability.resolver';

@Injectable()
export class StationOperationalCapabilityService {
  constructor(private readonly prisma: PrismaService) {}

  getContractMetadata() {
    return getStationOperationalCapabilityMetadata();
  }

  async resolveForStation(
    organizationId: string,
    stationId: string,
    options: { at?: string } = {},
  ): Promise<StationOperationalCapabilityResolverResult> {
    const snapshot = await this.loadSnapshot(organizationId, stationId);
    return resolveStationOperationalCapabilities(snapshot, { at: options.at });
  }

  async resolvePurposeForStation(
    organizationId: string,
    stationId: string,
    purpose: 'pickup' | 'return',
    options: { at?: string } = {},
  ): Promise<StationOperationalCapabilityEvaluation> {
    const snapshot = await this.loadSnapshot(organizationId, stationId);
    return resolveStationOperationalCapability(snapshot, purpose, { at: options.at });
  }

  private async loadSnapshot(organizationId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: {
        id: true,
        status: true,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        timezone: true,
        openingHours: true,
        holidayRules: true,
        calendarExceptions: {
          where: { status: StationCalendarExceptionStatus.ACTIVE },
          orderBy: [{ priority: 'desc' }, { calendarDate: 'asc' }],
        },
      },
    });

    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

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

    return {
      stationId: station.id,
      status: station.status,
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      afterHoursReturnEnabled: station.afterHoursReturnEnabled,
      keyBoxAvailable: station.keyBoxAvailable,
      timezone: station.timezone,
      openingHours: station.openingHours,
      calendarExceptions,
      legacyHolidayRules: station.holidayRules,
      temporaryOperationalRules: [],
    };
  }
}

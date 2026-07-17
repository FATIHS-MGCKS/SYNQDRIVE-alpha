import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StationCalendarException,
  StationCalendarExceptionSource,
  StationCalendarExceptionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getStationCalendarExceptionContractMetadata,
  STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION,
  StationCalendarExceptionRecord,
  StationCalendarExceptionSlot,
} from '@shared/stations/station-calendar-exception.contract';
import {
  assertNoCalendarExceptionConflicts,
  buildCalendarExceptionWriteData,
} from '@shared/stations/station-calendar-exception.validation';
import {
  legacyHolidayRulesHasEntries,
  parseLegacyHolidayRules,
} from '@shared/stations/station-holiday-rules.legacy';
import {
  CreateStationCalendarExceptionDto,
  UpdateStationCalendarExceptionDto,
} from './dto/station-calendar-exception.dto';

export interface StationCalendarExceptionDto {
  id: string;
  stationId: string;
  type: StationCalendarException['type'];
  status: StationCalendarExceptionStatus;
  title: string;
  description: string | null;
  recurrenceKind: StationCalendarException['recurrenceKind'];
  calendarDate: string | null;
  monthDay: string | null;
  closedAllDay: boolean;
  slots: StationCalendarExceptionSlot[] | null;
  regionCode: string | null;
  priority: number;
  source: StationCalendarExceptionSource;
  readOnly: boolean;
  timezone: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StationCalendarExceptionListDto {
  contractVersion: typeof STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION;
  timezone: string;
  items: StationCalendarExceptionDto[];
  legacyHolidayRulesPresent: boolean;
}

@Injectable()
export class StationCalendarExceptionService {
  constructor(private readonly prisma: PrismaService) {}

  getContractMetadata() {
    return getStationCalendarExceptionContractMetadata();
  }

  async listForStation(
    organizationId: string,
    stationId: string,
  ): Promise<StationCalendarExceptionListDto> {
    const station = await this.requireStation(organizationId, stationId);
    const rows = await this.prisma.stationCalendarException.findMany({
      where: { organizationId, stationId, status: StationCalendarExceptionStatus.ACTIVE },
      orderBy: [{ calendarDate: 'asc' }, { monthDay: 'asc' }, { priority: 'desc' }],
    });

    const items = rows.map((row) => this.toDto(row, station.timezone ?? 'Europe/Berlin', false));

    const importedLegacyKeys = new Set(
      rows
        .map((row) => row.legacyImportKey)
        .filter((key): key is string => typeof key === 'string'),
    );

    if (legacyHolidayRulesHasEntries(station.holidayRules)) {
      const legacyItems = parseLegacyHolidayRules(station.holidayRules, stationId)
        .filter((item) => !importedLegacyKeys.has(item.legacyImportKey))
        .map((item) => ({
          id: `legacy-${item.legacyImportKey}`,
          stationId,
          type: item.type,
          status: StationCalendarExceptionStatus.ACTIVE,
          title: item.title,
          description: item.description ?? null,
          recurrenceKind: item.recurrenceKind ?? 'NONE',
          calendarDate: item.calendarDate ?? null,
          monthDay: item.monthDay ?? null,
          closedAllDay: item.closedAllDay ?? false,
          slots: item.slots ?? null,
          regionCode: item.regionCode ?? null,
          priority: 0,
          source: StationCalendarExceptionSource.LEGACY_HOLIDAY_RULES,
          readOnly: true,
          timezone: station.timezone ?? 'Europe/Berlin',
          createdByUserId: null,
          updatedByUserId: null,
          cancelledAt: null,
          cancelledByUserId: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }));

      items.push(...legacyItems);
    }

    return {
      contractVersion: STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION,
      timezone: station.timezone ?? 'Europe/Berlin',
      items,
      legacyHolidayRulesPresent: legacyHolidayRulesHasEntries(station.holidayRules),
    };
  }

  async create(
    organizationId: string,
    stationId: string,
    payload: CreateStationCalendarExceptionDto,
    performedByUserId?: string | null,
  ): Promise<StationCalendarExceptionDto> {
    const station = await this.requireStation(organizationId, stationId);
    const existing = await this.loadActiveRecords(organizationId, stationId);
    assertNoCalendarExceptionConflicts(existing, payload);
    const data = buildCalendarExceptionWriteData(payload);

    const created = await this.prisma.stationCalendarException.create({
      data: {
        ...data,
        slots: this.serializeSlots(data.slots),
        organizationId,
        stationId,
        source: StationCalendarExceptionSource.MANUAL,
        createdByUserId: performedByUserId ?? null,
        updatedByUserId: performedByUserId ?? null,
      },
    });

    return this.toDto(created, station.timezone ?? 'Europe/Berlin', false);
  }

  async update(
    organizationId: string,
    stationId: string,
    exceptionId: string,
    payload: UpdateStationCalendarExceptionDto,
    performedByUserId?: string | null,
  ): Promise<StationCalendarExceptionDto> {
    const station = await this.requireStation(organizationId, stationId);
    const current = await this.prisma.stationCalendarException.findFirst({
      where: {
        id: exceptionId,
        organizationId,
        stationId,
        status: StationCalendarExceptionStatus.ACTIVE,
      },
    });
    if (!current) {
      throw new NotFoundException(`Calendar exception ${exceptionId} not found`);
    }

    const merged = {
      type: payload.type ?? current.type,
      title: payload.title ?? current.title,
      description:
        payload.description !== undefined ? payload.description : current.description,
      recurrenceKind: payload.recurrenceKind ?? current.recurrenceKind,
      calendarDate:
        payload.calendarDate !== undefined
          ? payload.calendarDate
          : current.calendarDate?.toISOString().slice(0, 10) ?? null,
      monthDay: payload.monthDay !== undefined ? payload.monthDay : current.monthDay,
      closedAllDay: payload.closedAllDay ?? current.closedAllDay,
      slots:
        payload.slots !== undefined
          ? payload.slots
          : (current.slots as StationCalendarExceptionSlot[] | null),
      regionCode: payload.regionCode !== undefined ? payload.regionCode : current.regionCode,
    };

    const existing = await this.loadActiveRecords(organizationId, stationId);
    assertNoCalendarExceptionConflicts(existing, merged, { excludeId: exceptionId });
    const data = buildCalendarExceptionWriteData(merged);

    const updated = await this.prisma.stationCalendarException.update({
      where: { id: exceptionId },
      data: {
        ...data,
        slots: this.serializeSlots(data.slots),
        updatedByUserId: performedByUserId ?? null,
      },
    });

    return this.toDto(updated, station.timezone ?? 'Europe/Berlin', false);
  }

  async cancel(
    organizationId: string,
    stationId: string,
    exceptionId: string,
    performedByUserId?: string | null,
  ): Promise<StationCalendarExceptionDto> {
    const station = await this.requireStation(organizationId, stationId);
    const current = await this.prisma.stationCalendarException.findFirst({
      where: { id: exceptionId, organizationId, stationId },
    });
    if (!current) {
      throw new NotFoundException(`Calendar exception ${exceptionId} not found`);
    }
    if (current.status === StationCalendarExceptionStatus.CANCELLED) {
      return this.toDto(current, station.timezone ?? 'Europe/Berlin', false);
    }

    const updated = await this.prisma.stationCalendarException.update({
      where: { id: exceptionId },
      data: {
        status: StationCalendarExceptionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: performedByUserId ?? null,
        updatedByUserId: performedByUserId ?? null,
      },
    });

    return this.toDto(updated, station.timezone ?? 'Europe/Berlin', false);
  }

  async importLegacyHolidayRules(
    organizationId: string,
    stationId: string,
    performedByUserId?: string | null,
  ): Promise<{ imported: number; skipped: number }> {
    const station = await this.requireStation(organizationId, stationId);
    if (!legacyHolidayRulesHasEntries(station.holidayRules)) {
      return { imported: 0, skipped: 0 };
    }

    const parsed = parseLegacyHolidayRules(station.holidayRules, stationId);
    let imported = 0;
    let skipped = 0;

    for (const item of parsed) {
      const existing = await this.prisma.stationCalendarException.findUnique({
        where: { legacyImportKey: item.legacyImportKey },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      try {
        const active = await this.loadActiveRecords(organizationId, stationId);
        assertNoCalendarExceptionConflicts(active, item);
        const data = buildCalendarExceptionWriteData(item);
        await this.prisma.stationCalendarException.create({
          data: {
            ...data,
            slots: this.serializeSlots(data.slots),
            organizationId,
            stationId,
            source: StationCalendarExceptionSource.LEGACY_HOLIDAY_RULES,
            legacyImportKey: item.legacyImportKey,
            createdByUserId: performedByUserId ?? null,
            updatedByUserId: performedByUserId ?? null,
          },
        });
        imported += 1;
      } catch (error) {
        if (error instanceof BadRequestException) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return { imported, skipped };
  }

  private serializeSlots(
    slots: StationCalendarExceptionSlot[] | null,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    if (slots == null) return Prisma.JsonNull;
    return slots as unknown as Prisma.InputJsonValue;
  }

  private async requireStation(organizationId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true, timezone: true, holidayRules: true },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);
    return station;
  }

  private async loadActiveRecords(
    organizationId: string,
    stationId: string,
  ): Promise<StationCalendarExceptionRecord[]> {
    const rows = await this.prisma.stationCalendarException.findMany({
      where: {
        organizationId,
        stationId,
        status: StationCalendarExceptionStatus.ACTIVE,
      },
    });
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: StationCalendarException): StationCalendarExceptionRecord {
    return {
      id: row.id,
      status: row.status,
      type: row.type,
      title: row.title,
      description: row.description,
      recurrenceKind: row.recurrenceKind,
      calendarDate: row.calendarDate?.toISOString().slice(0, 10) ?? null,
      monthDay: row.monthDay,
      closedAllDay: row.closedAllDay,
      slots: (row.slots as StationCalendarExceptionSlot[] | null) ?? null,
      regionCode: row.regionCode,
      priority: row.priority,
      source: row.source,
    };
  }

  private toDto(
    row: StationCalendarException,
    timezone: string,
    readOnly: boolean,
  ): StationCalendarExceptionDto {
    return {
      id: row.id,
      stationId: row.stationId,
      type: row.type,
      status: row.status,
      title: row.title,
      description: row.description,
      recurrenceKind: row.recurrenceKind,
      calendarDate: row.calendarDate?.toISOString().slice(0, 10) ?? null,
      monthDay: row.monthDay,
      closedAllDay: row.closedAllDay,
      slots: (row.slots as StationCalendarExceptionSlot[] | null) ?? null,
      regionCode: row.regionCode,
      priority: row.priority,
      source: row.source,
      readOnly,
      timezone,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      cancelledAt: row.cancelledAt,
      cancelledByUserId: row.cancelledByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

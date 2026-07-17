import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationCalendarExceptionService } from './station-calendar-exception.service';

const ORG = 'org-calendar';
const STATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('StationCalendarExceptionService', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
    },
    stationCalendarException: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationCalendarExceptionService(prisma);

  const stationRow = {
    id: STATION_ID,
    timezone: 'Europe/Berlin',
    holidayRules: {
      exceptions: [{ date: '2026-12-25', closed: true, name: 'Weihnachten' }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);
    (prisma.stationCalendarException.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('lists persisted and read-only legacy holiday rules', async () => {
    const result = await service.listForStation(ORG, STATION_ID);

    expect(result.timezone).toBe('Europe/Berlin');
    expect(result.legacyHolidayRulesPresent).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      readOnly: true,
      source: 'LEGACY_HOLIDAY_RULES',
      title: 'Weihnachten',
    });
  });

  it('creates a calendar exception with audit fields', async () => {
    (prisma.stationCalendarException.create as jest.Mock).mockResolvedValue({
      id: 'exc-1',
      organizationId: ORG,
      stationId: STATION_ID,
      type: StationCalendarExceptionType.SPECIAL_OPENING,
      status: 'ACTIVE',
      title: 'Sonderöffnung',
      description: null,
      recurrenceKind: StationCalendarRecurrenceKind.NONE,
      calendarDate: new Date('2026-07-20T00:00:00.000Z'),
      monthDay: null,
      closedAllDay: false,
      slots: [{ open: '10:00', close: '14:00' }],
      regionCode: null,
      priority: 100,
      source: 'MANUAL',
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await service.create(
      ORG,
      STATION_ID,
      {
        type: StationCalendarExceptionType.SPECIAL_OPENING,
        title: 'Sonderöffnung',
        calendarDate: '2026-07-20',
        closedAllDay: false,
        slots: [{ open: '10:00', close: '14:00' }],
      },
      'user-1',
    );

    expect(created.createdByUserId).toBe('user-1');
    expect(prisma.stationCalendarException.create).toHaveBeenCalled();
  });

  it('rejects closure when a special opening already exists', async () => {
    (prisma.stationCalendarException.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'special-1',
        organizationId: ORG,
        stationId: STATION_ID,
        type: StationCalendarExceptionType.SPECIAL_OPENING,
        status: 'ACTIVE',
        title: 'Special',
        description: null,
        recurrenceKind: StationCalendarRecurrenceKind.NONE,
        calendarDate: new Date('2026-12-24T00:00:00.000Z'),
        monthDay: null,
        closedAllDay: false,
        slots: [{ open: '10:00', close: '14:00' }],
        regionCode: null,
        priority: 100,
        source: 'MANUAL',
      },
    ]);

    await expect(
      service.create(ORG, STATION_ID, {
        type: StationCalendarExceptionType.STATION_CLOSURE,
        title: 'Close',
        calendarDate: '2026-12-24',
        closedAllDay: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('imports legacy holiday rules idempotently', async () => {
    (prisma.stationCalendarException.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.stationCalendarException.create as jest.Mock).mockResolvedValue({ id: 'imported' });

    const result = await service.importLegacyHolidayRules(ORG, STATION_ID, 'user-1');

    expect(result.imported).toBe(1);
    expect(prisma.stationCalendarException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'LEGACY_HOLIDAY_RULES',
          legacyImportKey: expect.stringContaining('legacy:'),
        }),
      }),
    );
  });

  it('cancels an exception for audit trail instead of deleting', async () => {
    (prisma.stationCalendarException.findFirst as jest.Mock).mockResolvedValue({
      id: 'exc-2',
      organizationId: ORG,
      stationId: STATION_ID,
      type: StationCalendarExceptionType.STATION_CLOSURE,
      status: 'ACTIVE',
      title: 'Closed',
      description: null,
      recurrenceKind: StationCalendarRecurrenceKind.NONE,
      calendarDate: new Date('2026-08-01T00:00:00.000Z'),
      monthDay: null,
      closedAllDay: true,
      slots: null,
      regionCode: null,
      priority: 20,
      source: 'MANUAL',
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (prisma.stationCalendarException.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'exc-2',
      organizationId: ORG,
      stationId: STATION_ID,
      type: StationCalendarExceptionType.STATION_CLOSURE,
      status: data.status,
      title: 'Closed',
      description: null,
      recurrenceKind: StationCalendarRecurrenceKind.NONE,
      calendarDate: new Date('2026-08-01T00:00:00.000Z'),
      monthDay: null,
      closedAllDay: true,
      slots: null,
      regionCode: null,
      priority: 20,
      source: 'MANUAL',
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      cancelledAt: data.cancelledAt,
      cancelledByUserId: data.cancelledByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const cancelled = await service.cancel(ORG, STATION_ID, 'exc-2', 'user-2');

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledByUserId).toBe('user-2');
  });

  it('throws when station is missing', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.listForStation(ORG, STATION_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StationCalendarExceptionType, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationalCapabilityKind } from '@shared/stations/station-operational-capability.resolver';

describe('StationOperationalCapabilityService', () => {
  let service: StationOperationalCapabilityService;

  const prisma = {
    station: {
      findFirst: jest.fn(),
    },
  };

  const stationRow = {
    id: 'station-1',
    status: 'ACTIVE' as StationStatus,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: true,
    keyBoxAvailable: true,
    timezone: 'Europe/Berlin',
    openingHours: {
      version: 2,
      tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    },
    holidayRules: null,
    calendarExceptions: [
      {
        id: 'exc-1',
        type: StationCalendarExceptionType.STATION_CLOSURE,
        title: 'Closed Tuesday',
        recurrenceKind: 'NONE',
        calendarDate: new Date('2026-07-14T00:00:00.000Z'),
        monthDay: null,
        closedAllDay: true,
        slots: null,
        regionCode: null,
        priority: 20,
        source: 'MANUAL',
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StationOperationalCapabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(StationOperationalCapabilityService);
  });

  it('exposes contract metadata', () => {
    expect(service.getContractMetadata().version).toBe(1);
    expect(service.getContractMetadata().bookingIntegration).toBe(false);
  });

  it('resolves capabilities from persisted station snapshot', async () => {
    prisma.station.findFirst.mockResolvedValue(stationRow);
    const at = '2026-07-14T08:00:00.000Z';
    const result = await service.resolveForStation('org-1', 'station-1', { at });
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.CLOSED);
    expect(result.return.kind).toBe(
      StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE,
    );
  });

  it('throws when station is missing', async () => {
    prisma.station.findFirst.mockResolvedValue(null);
    await expect(service.resolveForStation('org-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

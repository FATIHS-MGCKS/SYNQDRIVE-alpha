import { NotFoundException } from '@nestjs/common';
import { StationCalendarExceptionType, StationStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationOperationsService } from './station-operations.service';
import { StationGeofenceCapabilityStatus } from '@shared/stations/station-geofence-capability.contract';
import { StationOpeningStatus } from '@shared/stations/station-operations.resolver';

const ORG = 'org-ops';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationOperationsService', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationOperationsService(prisma, stationAccessScope);

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_ID],
    bypassScope: false,
  };

  const stationRow = {
    id: STATION_ID,
    organizationId: ORG,
    status: 'ACTIVE' as StationStatus,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    timezone: 'Europe/Berlin',
    openingHours: {
      version: 2,
      tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    },
    holidayRules: null,
    latitude: 52.52,
    longitude: 13.405,
    radiusMeters: 150,
    capacity: 5,
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

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'v1',
        homeStationId: STATION_ID,
        currentStationId: STATION_ID,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
    ]);
  });

  it('exposes operations contract metadata', () => {
    expect(service.getContractMetadata().frontendRecomputation).toBe(false);
    expect(service.getContractMetadata().sections).toContain('pickupCapability');
  });

  it('resolves canonical StationOperationsDto for scoped station', async () => {
    const result = await service.resolveForStation(ORG, STATION_ID, assignedScope, {
      at: '2026-07-14T08:00:00.000Z',
    });

    expect(result.stationId).toBe(STATION_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.openingStatus.status).toBe(StationOpeningStatus.CLOSED);
    expect(result.geofenceCapability.status).toBe(StationGeofenceCapabilityStatus.CONFIGURED_ONLY);
    expect(result.pickupCapability.reasons.length).toBeGreaterThan(0);
    expect(result.calendarException.active).toBe(true);
    expect(Array.isArray(result.configurationProblems)).toBe(true);
  });

  it('throws when station is outside tenant scope', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.resolveForStation(ORG, STATION_ID, assignedScope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

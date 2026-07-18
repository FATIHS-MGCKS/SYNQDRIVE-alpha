import { BadRequestException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationReadModelService } from './read-model/station-read-model.service';
import { StationDomainAuditService } from './audit/station-domain-audit.service';
import { StationsV2ConfigService } from './stations-v2-config.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('Stations V2 final fixes', () => {
  const prisma = {
    station: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    booking: { count: jest.fn(), findMany: jest.fn() },
    orgTask: { count: jest.fn() },
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.resolve(arg) : arg({
      station: { updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    }))),
  } as unknown as PrismaService;

  const stationValidation = {
    assertVehicleStationAssignment: jest.fn(),
    validateBookingStations: jest.fn(),
  } as unknown as StationValidationService;

  const stationAccess = {
    buildStationWhere: jest.fn((_org: string, access: { bypassScope?: boolean; allowedStationIds?: string[] | null }) =>
      access?.allowedStationIds ? { organizationId: 'org1', id: { in: access.allowedStationIds } } : { organizationId: 'org1' },
    ),
    assertStationReadable: jest.fn(),
  } as unknown as StationAccessService;

  const stationReadModel = {
    getOverviewStats: jest.fn(),
    getSummariesForStations: jest.fn(),
  } as unknown as StationReadModelService;

  const stationAudit = {
    record: jest.fn(),
  } as unknown as StationDomainAuditService;

  const stationsV2Config = {
    resolve: jest.fn().mockReturnValue({ stationGeofenceShadowEnabled: false }),
  } as unknown as StationsV2ConfigService;

  const service = new StationsService(
    prisma,
    stationValidation,
    stationAccess,
    stationReadModel,
    stationAudit,
    stationsV2Config,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delete always archives instead of hard delete (DEL-01)', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      organizationId: 'org1',
      status: 'ACTIVE',
      pickupEnabled: true,
      returnEnabled: true,
      isPrimary: false,
      _count: {
        vehiclesHome: 0,
        vehiclesCurrent: 0,
        vehiclesExpected: 0,
        pickupBookings: 0,
        returnBookings: 0,
      },
    });
    (prisma.station.update as jest.Mock).mockResolvedValue({
      id: 's1',
      organizationId: 'org1',
      name: 'S',
      status: 'ARCHIVED',
      type: 'BRANCH',
      isPrimary: false,
      address: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
      timezone: 'Europe/Berlin',
      radiusMeters: 100,
      phone: null,
      email: null,
      managerName: null,
      pickupEnabled: false,
      returnEnabled: false,
      afterHoursReturnEnabled: false,
      keyBoxAvailable: false,
      capacity: null,
      openingHours: null,
      holidayRules: null,
      handoverInstructions: null,
      returnInstructions: null,
      notes: null,
      internalNotes: null,
      googlePlaceId: null,
      archivedAt: new Date(),
      code: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { vehiclesHome: 0 },
    });

    const result = await service.delete('org1', 's1');
    expect(result.archived).toBe(true);
    expect(prisma.station.delete).not.toHaveBeenCalled();
  });

  it('rejects partial SET when requested fleet is incomplete (SET-03)', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: 's1' });
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(150);
    await expect(service.setStationVehicles('org1', 's1', ['v1'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('changeHomeStation updates home only (HCE-01)', async () => {
    (prisma.vehicle.update as jest.Mock).mockResolvedValue({
      id: 'v1',
      homeStationId: 's2',
      currentStationId: 's1',
      expectedStationId: null,
    });

    const result = await service.changeHomeStation('org1', 'v1', 's2', 'user-1');
    expect(result.homeStationId).toBe('s2');
    expect(result.currentStationId).toBe('s1');
    expect(stationValidation.assertVehicleStationAssignment).toHaveBeenCalledWith(
      'org1',
      'v1',
      's2',
      'home',
    );
  });

  it('blocks status changes via PATCH buildWriteData (LIFE-02)', async () => {
    (prisma.station.findFirstOrThrow as jest.Mock).mockResolvedValue({
      id: 's1',
      organizationId: 'org1',
      address: null,
      city: null,
      postalCode: null,
      country: null,
    });

    await expect(
      service.update('org1', 's1', { status: 'ARCHIVED' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

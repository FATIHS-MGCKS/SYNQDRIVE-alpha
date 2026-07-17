import { BadRequestException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationUpdateValidationCode } from './station-update-validation.util';

const ORG = 'org-update';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationsService update restrictions', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
  );

  const existingRow = {
    id: STATION_ID,
    organizationId: ORG,
    name: 'Zentrale',
    code: 'HQ',
    status: 'ACTIVE',
    type: 'MAIN',
    isPrimary: false,
    address: 'Str 1',
    addressLine2: null,
    city: 'Berlin',
    postalCode: '10115',
    country: 'DE',
    latitude: 52.5,
    longitude: 13.4,
    timezone: 'Europe/Berlin',
    radiusMeters: 100,
    phone: null,
    email: null,
    managerName: null,
    pickupEnabled: true,
    returnEnabled: true,
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
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { vehiclesHome: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirstOrThrow as jest.Mock).mockResolvedValue(existingRow);
    (prisma.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...existingRow,
      ...data,
    }));
  });

  it('updates allowed master data fields', async () => {
    const result = await service.update(ORG, STATION_ID, { name: 'Neuer Name' });
    expect(result.name).toBe('Neuer Name');
    expect(prisma.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Neuer Name' }),
      }),
    );
    expect(prisma.station.updateMany).not.toHaveBeenCalled();
  });

  it('rejects status changes via generic update', async () => {
    await expect(
      service.update(ORG, STATION_ID, { status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.station.update).not.toHaveBeenCalled();
  });

  it('rejects isPrimary via generic update', async () => {
    try {
      await service.update(ORG, STATION_ID, { isPrimary: true });
    } catch (e) {
      const response = (e as BadRequestException).getResponse() as { violations?: unknown[] };
      expect(response.violations?.[0]).toEqual(
        expect.objectContaining({ field: 'isPrimary' }),
      );
    }
    expect(prisma.station.update).not.toHaveBeenCalled();
    expect(prisma.station.updateMany).not.toHaveBeenCalled();
  });

  it('rejects pickup capability changes on archived station', async () => {
    (prisma.station.findFirstOrThrow as jest.Mock).mockResolvedValue({
      ...existingRow,
      status: 'ARCHIVED',
      pickupEnabled: false,
      returnEnabled: false,
    });

    try {
      await service.update(ORG, STATION_ID, { pickupEnabled: true });
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: StationUpdateValidationCode.ARCHIVED_CAPABILITY_PATCH_FORBIDDEN,
      });
    }
    expect(prisma.station.update).not.toHaveBeenCalled();
  });

  it('rejects unknown fields instead of ignoring them', async () => {
    await expect(
      service.update(ORG, STATION_ID, { unknownField: 'x' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

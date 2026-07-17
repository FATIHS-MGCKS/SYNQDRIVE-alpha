import { GoneException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_DELETE_DEPRECATED_CODE } from './station-delete-deprecation.constants';

const ORG = 'org-delete-deprecation';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationsService DELETE deprecation', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: STATION_ID });
  });

  it('returns 410 Gone with deprecation payload instead of mutating station', async () => {
    await expect(service.delete(ORG, STATION_ID)).rejects.toBeInstanceOf(GoneException);

    try {
      await service.delete(ORG, STATION_ID);
    } catch (error) {
      expect((error as GoneException).getResponse()).toEqual(
        expect.objectContaining({
          code: STATION_DELETE_DEPRECATED_CODE,
          replacement: expect.objectContaining({
            command: 'ArchiveStation',
            method: 'POST',
          }),
        }),
      );
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.station.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when station does not exist', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.delete(ORG, STATION_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

import { BadRequestException, GoneException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import {
  STATION_SET_VEHICLES_DISABLE_FLAG,
  STATION_SET_VEHICLES_INCOMPLETE_LIST_CODE,
} from './station-set-vehicles-deprecation.constants';
import { StationSetVehiclesListCompleteness } from '@shared/stations/station-set-vehicles.policy';

const ORG = 'org-set-vehicles';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationsService setStationVehicles deprecation', () => {
  const originalFlag = process.env[STATION_SET_VEHICLES_DISABLE_FLAG];

  const prisma = {
    station: { findFirst: jest.fn() },
    vehicle: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    stationOperationsServiceMock,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[STATION_SET_VEHICLES_DISABLE_FLAG];
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: STATION_ID });
    (prisma.vehicle.update as jest.Mock).mockImplementation(async ({ where }) => ({
      id: where.id,
      homeStationId: STATION_ID,
      currentStationId: 'current-unchanged',
      expectedStationId: 'expected-unchanged',
    }));
  });

  afterAll(() => {
    if (originalFlag === undefined) {
      delete process.env[STATION_SET_VEHICLES_DISABLE_FLAG];
    } else {
      process.env[STATION_SET_VEHICLES_DISABLE_FLAG] = originalFlag;
    }
  });

  it('rejects the 600-fleet / 500-loaded regression when payload omits station home vehicles', async () => {
    const stationHomeIds = Array.from({ length: 150 }, (_, index) => `home-${index + 1}`);
    const visibleLoadedIds = Array.from({ length: 500 }, (_, index) => `veh-${index + 1}`);
    const payloadIds = [...stationHomeIds.slice(0, 120), ...visibleLoadedIds.slice(150, 500)];

    (prisma.vehicle.findMany as jest.Mock).mockResolvedValueOnce(
      stationHomeIds.map((id) => ({ id })),
    );

    await expect(
      service.setStationVehicles(ORG, STATION_ID, payloadIds),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: STATION_SET_VEHICLES_INCOMPLETE_LIST_CODE,
        blockingReasons: expect.arrayContaining([
          expect.objectContaining({ missingCount: 30 }),
        ]),
      }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('attaches home-only without writing currentStationId or detaching missing vehicles', async () => {
    const stationHomeIds = ['home-1', 'home-2'];
    const attachId = 'attach-1';

    (prisma.vehicle.findMany as jest.Mock)
      .mockResolvedValueOnce(stationHomeIds.map((id) => ({ id })))
      .mockResolvedValueOnce([
        { id: 'home-1', homeStationId: STATION_ID, currentStationId: 'cur-1', expectedStationId: 'exp-1' },
        { id: 'home-2', homeStationId: STATION_ID, currentStationId: 'cur-2', expectedStationId: 'exp-2' },
        {
          id: attachId,
          homeStationId: null,
          currentStationId: 'cur-attach',
          expectedStationId: 'exp-attach',
        },
      ]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(3);

    const result = await service.setStationVehicles(ORG, STATION_ID, [
      'home-1',
      'home-2',
      attachId,
    ]);

    expect(result.detached).toBe(0);
    expect(result.deprecation.deprecated).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: attachId, organizationId: ORG },
      data: {
        homeStationId: STATION_ID,
        stationPositionVersion: { increment: 1 },
      },
    });
    expect(prisma.vehicle.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStationId: expect.anything() }),
      }),
    );
  });

  it('rejects explicitly declared partial lists', async () => {
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.setStationVehicles(ORG, STATION_ID, [], {
        listCompleteness: StationSetVehiclesListCompleteness.PARTIAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 410 when disable flag is enabled', async () => {
    process.env[STATION_SET_VEHICLES_DISABLE_FLAG] = 'true';

    await expect(service.setStationVehicles(ORG, STATION_ID, [])).rejects.toBeInstanceOf(
      GoneException,
    );
  });
});

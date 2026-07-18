import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationOperationsService } from './station-operations.service';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { VehicleHomeFleetDeltaItemOutcome } from './vehicle-home-fleet-delta.types';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';

const ORG_A = 'org-tenant-a';
const ORG_B = 'org-tenant-b';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('Stations V2 tenant isolation package', () => {
  const prisma = {
    station: { findFirst: jest.fn(), findMany: jest.fn() },
    vehicle: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    booking: { findMany: jest.fn(), count: jest.fn() },
    orgTask: { count: jest.fn() },
    activityLog: { findMany: jest.fn() },
    organizationMembership: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const stationOperations = new StationOperationsService(prisma, stationAccessScope);

  const stationsService = new StationsService(
    prisma,
    {} as StationValidationService,
    stationAccessScope,
    stationOperations,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  const homeFleetDelta = new VehicleHomeFleetDeltaService(prisma);

  const allStationsScope = {
    orgId: ORG_A,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when reading a station from another organization', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(stationsService.findOne(ORG_A, STATION_A, allStationsScope)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.station.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: STATION_A,
          organizationId: ORG_A,
        }),
      }),
    );
  });

  it('scopes fleet queries to the requested organization', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_A,
      organizationId: ORG_A,
      status: 'ACTIVE',
    });
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);

    await stationsService.getStationFleet(ORG_A, STATION_A, allStationsScope);

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      }),
    );
  });

  it('does not leak cross-tenant vehicles in home-fleet delta batches', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_A,
      organizationId: ORG_A,
      status: 'ACTIVE',
      name: 'A',
    });
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);

    const result = await homeFleetDelta.addVehiclesToHomeStation(ORG_A, STATION_A, [VEHICLE_A]);

    expect(result.results[0]?.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.FAILED);
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cross-org station targets in home-fleet delta move', async () => {
    const stationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    (prisma.station.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { id?: string; organizationId?: string } }) => {
        if (where.organizationId === ORG_B) return null;
        if (where.id === STATION_A && where.organizationId === ORG_A) {
          return { id: STATION_A, organizationId: ORG_A, status: 'ACTIVE', name: 'A' };
        }
        return null;
      },
    );

    await expect(
      homeFleetDelta.moveVehiclesToHomeStation(ORG_A, STATION_A, stationB, [VEHICLE_A]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

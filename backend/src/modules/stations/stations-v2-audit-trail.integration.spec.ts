import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationDomainAuditAction } from '@shared/stations/station-domain-audit.constants';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import {
  VehicleChangeHomeStationCommandOutcome,
} from './vehicle-change-home-station-command.types';

const ORG = 'org-audit-trail';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_STATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID = 'user-auditor';

describe('Stations V2 audit trail command wiring', () => {
  const tx = {
    station: { updateMany: jest.fn(), update: jest.fn() },
    vehicle: { updateMany: jest.fn(), update: jest.fn() },
  };

  const prisma = {
    station: { findFirst: jest.fn() },
    vehicle: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;

  const stationValidation = {
    assertVehicleStationAssignment: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationValidationService;

  const service = new StationsService(
    prisma,
    stationValidation,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    stationOperationsServiceMock,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('records HOME_STATION_CHANGED after a successful change-home command', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: VEHICLE_ID,
        homeStationId: STATION_ID,
        currentStationId: STATION_ID,
        expectedStationId: null,
        stationPositionVersion: 0,
        status: 'AVAILABLE',
      })
      .mockResolvedValueOnce({
        id: VEHICLE_ID,
        homeStationId: TARGET_STATION,
        currentStationId: STATION_ID,
        expectedStationId: null,
        stationPositionVersion: 1,
        status: 'AVAILABLE',
      });
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: TARGET_STATION,
      organizationId: ORG,
      status: 'ACTIVE',
    });

    const result = await service.changeVehicleHomeStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        newHomeStationId: TARGET_STATION,
        expectedVersion: 0,
        reason: 'Rebalance',
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.APPLIED);
    expect(stationDomainAuditServiceMock.recordForStations).toHaveBeenCalledWith(
      [STATION_ID, TARGET_STATION],
      expect.objectContaining({
        organizationId: ORG,
        auditAction: StationDomainAuditAction.HOME_STATION_CHANGED,
        actorUserId: USER_ID,
        vehicleId: VEHICLE_ID,
        from: STATION_ID,
        to: TARGET_STATION,
      }),
    );
  });

  it('records CURRENT_STATION_CORRECTED after a successful correction command', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: VEHICLE_ID,
        homeStationId: STATION_ID,
        currentStationId: STATION_ID,
        expectedStationId: null,
        currentStationSource: 'MANUAL',
        currentStationConfirmedAt: new Date(),
        stationPositionVersion: 0,
        status: 'AVAILABLE',
      })
      .mockResolvedValueOnce({
        id: VEHICLE_ID,
        homeStationId: STATION_ID,
        currentStationId: TARGET_STATION,
        expectedStationId: null,
        currentStationSource: 'MANUAL',
        currentStationConfirmedAt: new Date(),
        stationPositionVersion: 1,
        status: 'AVAILABLE',
      });
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: TARGET_STATION,
      organizationId: ORG,
      status: 'ACTIVE',
    });

    await service.correctVehicleCurrentStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        currentStationId: TARGET_STATION,
        source: 'MANUAL',
        reason: 'Yard recount',
        expectedVersion: 0,
      },
      USER_ID,
    );

    expect(stationDomainAuditServiceMock.recordForStations).toHaveBeenCalledWith(
      [STATION_ID, TARGET_STATION],
      expect.objectContaining({
        auditAction: StationDomainAuditAction.CURRENT_STATION_CORRECTED,
        actorUserId: USER_ID,
        vehicleId: VEHICLE_ID,
      }),
    );
  });
});

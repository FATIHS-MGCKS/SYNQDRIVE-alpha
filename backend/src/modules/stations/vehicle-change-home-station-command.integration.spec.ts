import { ConflictException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import {
  VehicleChangeHomeStationCommandIssueCode,
  VehicleChangeHomeStationCommandName,
  VehicleChangeHomeStationCommandOutcome,
} from './vehicle-change-home-station-command.types';

const ORG = 'org-change-home';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'user-change-home';

describe('StationsService changeVehicleHomeStation command', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const stationValidation = {
    assertVehicleStationAssignment: jest.fn(),
  } as unknown as StationValidationService;

  const service = new StationsService(
    prisma,
    stationValidation,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    stationOperationsServiceMock,
  );

  const vehicleRow = (overrides: Record<string, unknown> = {}) => ({
    id: VEHICLE_ID,
    homeStationId: STATION_A,
    currentStationId: STATION_B,
    expectedStationId: STATION_B,
    stationPositionVersion: 1,
    status: 'AVAILABLE',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleRow());
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (stationValidation.assertVehicleStationAssignment as jest.Mock).mockResolvedValue(undefined);
  });

  it('changes only homeStationId and preserves current/expected with version increment', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow())
      .mockResolvedValueOnce(
        vehicleRow({
          homeStationId: STATION_B,
          stationPositionVersion: 2,
        }),
      );

    const result = await service.changeVehicleHomeStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        newHomeStationId: STATION_B,
        expectedVersion: 1,
        reason: 'Fleet rebalancing',
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.APPLIED);
    expect(result.command).toBe(VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION);
    expect(result.vehicle.homeStationId).toBe(STATION_B);
    expect(result.vehicle.currentStationId).toBe(STATION_B);
    expect(result.vehicle.expectedStationId).toBe(STATION_B);
    expect(result.vehicle.stationPositionVersion).toBe(2);
    expect(result.audit.fromHomeStationId).toBe(STATION_A);
    expect(result.audit.toHomeStationId).toBe(STATION_B);
    expect(result.audit.previousStationPositionVersion).toBe(1);
    expect(result.audit.nextStationPositionVersion).toBe(2);
    expect(result.audit.reason).toBe('Fleet rebalancing');
    expect(result.audit.performedByUserId).toBe(USER_ID);
    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: VEHICLE_ID,
        organizationId: ORG,
        stationPositionVersion: 1,
      },
      data: {
        homeStationId: STATION_B,
        stationPositionVersion: { increment: 1 },
      },
    });
    expect(stationValidation.assertVehicleStationAssignment).toHaveBeenCalledWith(
      ORG,
      VEHICLE_ID,
      STATION_B,
      'home',
    );
  });

  it('returns IDEMPOTENT without writing when home station is unchanged', async () => {
    const result = await service.changeVehicleHomeStation(ORG, {
      vehicleId: VEHICLE_ID,
      newHomeStationId: STATION_A,
      expectedVersion: 1,
    });

    expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.IDEMPOTENT);
    expect(result.audit.idempotent).toBe(true);
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(stationValidation.assertVehicleStationAssignment).not.toHaveBeenCalled();
  });

  it('warns but allows home change for rented vehicles', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow({ status: 'RENTED' }))
      .mockResolvedValueOnce(
        vehicleRow({
          status: 'RENTED',
          homeStationId: STATION_B,
          stationPositionVersion: 2,
        }),
      );

    const result = await service.changeVehicleHomeStation(ORG, {
      vehicleId: VEHICLE_ID,
      newHomeStationId: STATION_B,
      expectedVersion: 1,
    });

    expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.APPLIED);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: VehicleChangeHomeStationCommandIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
      }),
    ]);
  });

  it('allows detach home without target station validation', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow())
      .mockResolvedValueOnce(
        vehicleRow({
          homeStationId: null,
          stationPositionVersion: 2,
        }),
      );

    const result = await service.changeVehicleHomeStation(ORG, {
      vehicleId: VEHICLE_ID,
      newHomeStationId: null,
      expectedVersion: 1,
    });

    expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.APPLIED);
    expect(result.vehicle.homeStationId).toBeNull();
    expect(stationValidation.assertVehicleStationAssignment).not.toHaveBeenCalled();
  });

  it('throws NotFound when vehicle is outside tenant', async () => {
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.changeVehicleHomeStation(ORG, {
        vehicleId: VEHICLE_ID,
        newHomeStationId: STATION_B,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Conflict when expectedVersion does not match', async () => {
    await expect(
      service.changeVehicleHomeStation(ORG, {
        vehicleId: VEHICLE_ID,
        newHomeStationId: STATION_B,
        expectedVersion: 99,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws Conflict when optimistic update loses race', async () => {
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(
      service.changeVehicleHomeStation(ORG, {
        vehicleId: VEHICLE_ID,
        newHomeStationId: STATION_B,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

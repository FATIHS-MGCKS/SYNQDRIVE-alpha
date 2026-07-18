import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import {
  VehicleCorrectCurrentStationCommandIssueCode,
  VehicleCorrectCurrentStationCommandName,
  VehicleCorrectCurrentStationCommandOutcome,
} from './vehicle-correct-current-station-command.types';

const ORG = 'org-correct-current';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'user-correct-current';

describe('StationsService correctVehicleCurrentStation command', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
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
    currentStationId: STATION_A,
    expectedStationId: STATION_B,
    currentStationSource: 'PICKUP',
    currentStationConfirmedAt: new Date('2026-07-18T10:00:00.000Z'),
    stationPositionVersion: 1,
    status: 'AVAILABLE',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleRow());
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_B,
      status: 'ACTIVE',
    });
    (stationValidation.assertVehicleStationAssignment as jest.Mock).mockResolvedValue(undefined);
  });

  it('changes only current position metadata and preserves home/expected', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow())
      .mockResolvedValueOnce(
        vehicleRow({
          currentStationId: STATION_B,
          currentStationSource: 'MANUAL',
          currentStationConfirmedAt: new Date('2026-07-18T12:00:00.000Z'),
          stationPositionVersion: 2,
        }),
      );

    const result = await service.correctVehicleCurrentStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Yard recount',
        expectedVersion: 1,
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.APPLIED);
    expect(result.command).toBe(VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION);
    expect(result.vehicle.homeStationId).toBe(STATION_A);
    expect(result.vehicle.currentStationId).toBe(STATION_B);
    expect(result.vehicle.expectedStationId).toBe(STATION_B);
    expect(result.vehicle.currentStationSource).toBe('MANUAL');
    expect(result.vehicle.stationPositionVersion).toBe(2);
    expect(result.audit.fromCurrentStationId).toBe(STATION_A);
    expect(result.audit.toCurrentStationId).toBe(STATION_B);
    expect(result.audit.source).toBe('MANUAL');
    expect(result.audit.reason).toBe('Yard recount');
    expect(result.audit.performedByUserId).toBe(USER_ID);
    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: VEHICLE_ID,
        organizationId: ORG,
        stationPositionVersion: 1,
      },
      data: expect.objectContaining({
        currentStationId: STATION_B,
        currentStationSource: 'MANUAL',
        currentStationConfirmedByUserId: USER_ID,
        stationPositionVersion: { increment: 1 },
      }),
    });
  });

  it('returns IDEMPOTENT without writing when current station is unchanged', async () => {
    const result = await service.correctVehicleCurrentStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_A,
        source: 'MANUAL',
        reason: 'No-op check',
        expectedVersion: 1,
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.IDEMPOTENT);
    expect(result.audit.idempotent).toBe(true);
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.station.findFirst).not.toHaveBeenCalled();
  });

  it('warns but allows correction for rented vehicles', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow({ status: 'RENTED' }))
      .mockResolvedValueOnce(
        vehicleRow({
          status: 'RENTED',
          currentStationId: STATION_B,
          currentStationSource: 'MANUAL',
          stationPositionVersion: 2,
        }),
      );

    const result = await service.correctVehicleCurrentStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Driver reported wrong yard',
        expectedVersion: 1,
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.APPLIED);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: VehicleCorrectCurrentStationCommandIssueCode.VEHICLE_RENTED_CURRENT_CORRECTION_WARNING,
      }),
    ]);
  });

  it('blocks archived target stations with command-shaped error', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_B,
      status: 'ARCHIVED',
    });

    await expect(
      service.correctVehicleCurrentStation(
        ORG,
        {
          vehicleId: VEHICLE_ID,
          currentStationId: STATION_B,
          source: 'MANUAL',
          reason: 'Should fail',
          expectedVersion: 1,
        },
        USER_ID,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        outcome: VehicleCorrectCurrentStationCommandOutcome.BLOCKED,
        blockingReasons: [
          expect.objectContaining({
            code: VehicleCorrectCurrentStationCommandIssueCode.TARGET_STATION_ARCHIVED,
          }),
        ],
      }),
    });
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('clears current location and provenance metadata', async () => {
    (prisma.vehicle.findFirst as jest.Mock)
      .mockResolvedValueOnce(vehicleRow())
      .mockResolvedValueOnce(
        vehicleRow({
          currentStationId: null,
          currentStationSource: null,
          currentStationConfirmedAt: null,
          stationPositionVersion: 2,
        }),
      );

    const result = await service.correctVehicleCurrentStation(
      ORG,
      {
        vehicleId: VEHICLE_ID,
        currentStationId: null,
        source: 'MANUAL',
        reason: 'Unknown physical location',
        expectedVersion: 1,
      },
      USER_ID,
    );

    expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.APPLIED);
    expect(result.vehicle.currentStationId).toBeNull();
    expect(result.vehicle.homeStationId).toBe(STATION_A);
    expect(result.vehicle.expectedStationId).toBe(STATION_B);
    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: VEHICLE_ID,
        organizationId: ORG,
        stationPositionVersion: 1,
      },
      data: {
        currentStationId: null,
        currentStationSource: null,
        currentStationConfirmedAt: null,
        currentStationConfirmedByUserId: null,
        stationPositionVersion: { increment: 1 },
      },
    });
  });

  it('throws NotFound when vehicle is outside tenant', async () => {
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.correctVehicleCurrentStation(ORG, {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Missing vehicle',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when target station is outside tenant', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.correctVehicleCurrentStation(ORG, {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Missing station',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Conflict when expectedVersion does not match', async () => {
    await expect(
      service.correctVehicleCurrentStation(ORG, {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Stale version',
        expectedVersion: 99,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws Conflict when optimistic update loses race', async () => {
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(
      service.correctVehicleCurrentStation(ORG, {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Race',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException for inactive target stations', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_B,
      status: 'INACTIVE',
    });

    await expect(
      service.correctVehicleCurrentStation(ORG, {
        vehicleId: VEHICLE_ID,
        currentStationId: STATION_B,
        source: 'MANUAL',
        reason: 'Inactive target',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

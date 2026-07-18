import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  VehicleStationTransferCommandName,
  VehicleStationTransferCommandOutcome,
} from './vehicle-station-transfer.types';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationsAccessService } from './stations-access.service';

const ORG = 'org-transfer';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRANSFER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'user-transfer';

describe('VehicleStationTransferService', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    vehicleStationTransfer: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const manualOverrideService = {
    persistAppliedOverride: jest.fn(),
    validate: jest.fn(),
  } as unknown as StationRuleManualOverrideService;

  const stationsAccess = {
    assertStationsPermission: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationsAccessService;

  const service = new VehicleStationTransferService(
    prisma,
    manualOverrideService,
    stationsAccess,
  );

  const vehicleRow = (overrides: Record<string, unknown> = {}) => ({
    id: VEHICLE_ID,
    homeStationId: STATION_A,
    currentStationId: STATION_A,
    expectedStationId: null,
    expectedStationSource: null,
    expectedStationSetAt: null,
    stationPositionVersion: 1,
    ...overrides,
  });

  const transferRow = (overrides: Record<string, unknown> = {}) => ({
    id: TRANSFER_ID,
    organizationId: ORG,
    vehicleId: VEHICLE_ID,
    fromStationId: STATION_A,
    toStationId: STATION_B,
    status: 'PLANNED',
    plannedAt: new Date('2026-07-18T10:00:00.000Z'),
    expectedArrivalAt: new Date('2026-07-18T18:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdByUserId: USER_ID,
    performedByUserId: USER_ID,
    reason: 'Fleet rebalance',
    sourceBookingId: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_B,
      status: 'ACTIVE',
      capacity: null,
    });
    (prisma.vehicleStationTransfer.count as jest.Mock).mockResolvedValue(0);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleRow());
    (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(prisma),
    );
  });

  describe('planTransfer', () => {
    it('creates planned transfer and sets expected without touching home', async () => {
      (prisma.vehicleStationTransfer.create as jest.Mock).mockResolvedValue(
        transferRow(),
      );
      (prisma.vehicle.findFirstOrThrow as jest.Mock).mockResolvedValue(
        vehicleRow({
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
          stationPositionVersion: 2,
        }),
      );

      const result = await service.planTransfer(
        ORG,
        {
          vehicleId: VEHICLE_ID,
          toStationId: STATION_B,
          reason: 'Fleet rebalance',
        },
        USER_ID,
      );

      expect(result.outcome).toBe(VehicleStationTransferCommandOutcome.APPLIED);
      expect(result.command).toBe(VehicleStationTransferCommandName.PLAN);
      expect(result.vehicle.homeStationId).toBe(STATION_A);
      expect(result.vehicle.expectedStationId).toBe(STATION_B);
      expect(result.audit.setExpected).toBe(true);
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          id: VEHICLE_ID,
          organizationId: ORG,
          stationPositionVersion: 1,
        },
        data: expect.objectContaining({
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
          stationPositionVersion: { increment: 1 },
        }),
      });
    });

    it('blocks when another active transfer exists', async () => {
      (prisma.vehicleStationTransfer.count as jest.Mock).mockResolvedValue(1);

      const result = await service.planTransfer(ORG, {
        vehicleId: VEHICLE_ID,
        toStationId: STATION_B,
      });

      expect(result.outcome).toBe(VehicleStationTransferCommandOutcome.BLOCKED);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('markArrived', () => {
    it('sets current, clears expected, and preserves home', async () => {
      (prisma.vehicleStationTransfer.findFirst as jest.Mock).mockResolvedValue(
        transferRow({ status: 'IN_TRANSIT', startedAt: new Date() }),
      );
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(
        vehicleRow({
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
        }),
      );
      (prisma.vehicleStationTransfer.update as jest.Mock).mockResolvedValue(
        transferRow({ status: 'ARRIVED', completedAt: new Date() }),
      );
      (prisma.vehicle.findFirstOrThrow as jest.Mock).mockResolvedValue(
        vehicleRow({
          currentStationId: STATION_B,
          currentStationSource: 'TRANSFER',
          expectedStationId: null,
          expectedStationSource: null,
          stationPositionVersion: 2,
        }),
      );

      const result = await service.markArrived(
        ORG,
        TRANSFER_ID,
        'Arrived at destination',
        USER_ID,
        1,
      );

      expect(result.outcome).toBe(VehicleStationTransferCommandOutcome.APPLIED);
      expect(result.command).toBe(VehicleStationTransferCommandName.ARRIVE);
      expect(result.vehicle.homeStationId).toBe(STATION_A);
      expect(result.vehicle.currentStationId).toBe(STATION_B);
      expect(result.vehicle.expectedStationId).toBeNull();
      expect(result.audit.setCurrent).toBe(true);
      expect(result.audit.clearedExpected).toBe(true);
    });
  });

  describe('cancelTransfer', () => {
    it('clears transfer-owned expected when no other active context exists', async () => {
      (prisma.vehicleStationTransfer.findFirst as jest.Mock).mockResolvedValue(
        transferRow(),
      );
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(
        vehicleRow({
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
        }),
      );
      (prisma.vehicleStationTransfer.update as jest.Mock).mockResolvedValue(
        transferRow({ status: 'CANCELLED', cancelledAt: new Date() }),
      );
      (prisma.vehicle.findFirstOrThrow as jest.Mock).mockResolvedValue(
        vehicleRow({
          expectedStationId: null,
          expectedStationSource: null,
          stationPositionVersion: 2,
        }),
      );

      const result = await service.cancelTransfer(
        ORG,
        TRANSFER_ID,
        'No longer needed',
        USER_ID,
        1,
      );

      expect(result.outcome).toBe(VehicleStationTransferCommandOutcome.APPLIED);
      expect(result.audit.clearedExpected).toBe(true);
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expectedStationId: null,
            expectedStationSource: null,
          }),
        }),
      );
    });

    it('does not clear booking-owned expected on cancel', async () => {
      (prisma.vehicleStationTransfer.findFirst as jest.Mock).mockResolvedValue(
        transferRow(),
      );
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(
        vehicleRow({
          expectedStationId: STATION_B,
          expectedStationSource: 'RETURN',
        }),
      );
      (prisma.vehicleStationTransfer.update as jest.Mock).mockResolvedValue(
        transferRow({ status: 'CANCELLED', cancelledAt: new Date() }),
      );

      const result = await service.cancelTransfer(ORG, TRANSFER_ID, 'Cancel', USER_ID, 1);

      expect(result.audit.clearedExpected).toBe(false);
      expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('transitionTransfer', () => {
    it('throws when transfer is missing', async () => {
      (prisma.vehicleStationTransfer.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.transitionTransfer(ORG, {
          transferId: TRANSFER_ID,
          targetStatus: 'READY',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws conflict on stale expectedVersion', async () => {
      (prisma.vehicleStationTransfer.findFirst as jest.Mock).mockResolvedValue(
        transferRow(),
      );
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleRow());

      await expect(
        service.transitionTransfer(
          ORG,
          { transferId: TRANSFER_ID, targetStatus: 'READY', expectedVersion: 99 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

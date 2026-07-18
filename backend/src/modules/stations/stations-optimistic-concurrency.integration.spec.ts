import { ConflictException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationConcurrencyErrorCode } from '@shared/stations/station-optimistic-concurrency.constants';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { VehicleHomeFleetDeltaItemOutcome } from './vehicle-home-fleet-delta.types';

const ORG = 'org-station-concurrency';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'user-concurrency';

describe('Stations optimistic concurrency', () => {
  const stationUpdatedAt = new Date('2026-07-18T12:00:00.000Z');

  const existingStationRow = {
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
    createdAt: stationUpdatedAt,
    updatedAt: stationUpdatedAt,
    _count: { vehiclesHome: 0 },
  };

  describe('station master data / operational rules', () => {
    const prisma = {
      station: {
        findFirstOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
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
      (prisma.station.findFirstOrThrow as jest.Mock).mockResolvedValue(existingStationRow);
      (prisma.station.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
        ...existingStationRow,
        ...data,
        updatedAt: new Date('2026-07-18T12:00:01.000Z'),
      }));
    });

    it('applies PATCH with matching expectedUpdatedAt via updateMany lock', async () => {
      (prisma.station.findFirstOrThrow as jest.Mock)
        .mockResolvedValueOnce(existingStationRow)
        .mockResolvedValueOnce({
          ...existingStationRow,
          pickupEnabled: false,
          updatedAt: new Date('2026-07-18T12:00:01.000Z'),
        });

      const result = await service.update(ORG, STATION_ID, {
        pickupEnabled: false,
        expectedUpdatedAt: stationUpdatedAt.toISOString(),
      });

      expect(result.pickupEnabled).toBe(false);
      expect(prisma.station.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: STATION_ID,
            organizationId: ORG,
            updatedAt: stationUpdatedAt,
          },
          data: expect.objectContaining({ pickupEnabled: false }),
        }),
      );
      expect(prisma.station.update).not.toHaveBeenCalled();
    });

    it('returns 409 when expectedUpdatedAt is stale before write', async () => {
      await expect(
        service.update(ORG, STATION_ID, {
          name: 'Neuer Name',
          expectedUpdatedAt: '2026-07-18T12:00:01.000Z',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
        }),
      });
      expect(prisma.station.updateMany).not.toHaveBeenCalled();
    });

    it('returns 409 when updateMany lock fails after concurrent write', async () => {
      (prisma.station.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.update(ORG, STATION_ID, {
          capacity: 25,
          expectedUpdatedAt: stationUpdatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
        }),
      });
    });
  });

  describe('set-primary', () => {
    const tx = {
      $executeRaw: jest.fn(),
      station: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const prisma = {
      station: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
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
      (prisma.station.findFirst as jest.Mock).mockResolvedValue(existingStationRow);
      (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
      (tx.$executeRaw as jest.Mock).mockResolvedValue(1);
      (tx.station.findMany as jest.Mock).mockResolvedValue([]);
      (tx.station.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (tx.station.update as jest.Mock).mockResolvedValue({
        ...existingStationRow,
        isPrimary: true,
      });
    });

    it('returns 409 when expectedUpdatedAt mismatches before transaction', async () => {
      await expect(
        service.setPrimaryStation(ORG, STATION_ID, USER_ID, {
          expectedUpdatedAt: '2026-07-18T12:00:01.000Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns 409 when station row changed inside transaction', async () => {
      (tx.station.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.setPrimaryStation(ORG, STATION_ID, USER_ID, {
          expectedUpdatedAt: stationUpdatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
        }),
      });
    });
  });

  describe('vehicle position writers', () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
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
      stationVehicleRuntimeLoaderMock as never,
      stationDomainAuditServiceMock as never,
    );

    const vehicleRow = {
      id: VEHICLE_ID,
      homeStationId: null,
      currentStationId: null,
      expectedStationId: null,
      stationPositionVersion: 4,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleRow);
      (prisma.vehicle.findFirstOrThrow as jest.Mock).mockResolvedValue({
        ...vehicleRow,
        currentStationId: STATION_ID,
        stationPositionVersion: 5,
      });
      (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (stationValidation.assertVehicleStationAssignment as jest.Mock).mockResolvedValue(undefined);
    });

    it('assignVehicle rejects stale expectedVersion before write', async () => {
      await expect(
        service.assignVehicleToStation(ORG, STATION_ID, VEHICLE_ID, 'current', 3),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
        }),
      });
      expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    });

    it('assignVehicle returns 409 when updateMany loses race', async () => {
      (prisma.vehicle.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.assignVehicleToStation(ORG, STATION_ID, VEHICLE_ID, 'current', 4),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
        }),
      });
    });

    it('updateVehicleCurrentStation rejects stale expectedVersion', async () => {
      await expect(
        service.updateVehicleCurrentStation(ORG, VEHICLE_ID, STATION_ID, undefined, 2),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
        }),
      });
      expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    });

    it('updateVehicleCurrentStation writes with matching expectedVersion', async () => {
      const result = await service.updateVehicleCurrentStation(
        ORG,
        VEHICLE_ID,
        STATION_ID,
        undefined,
        4,
      );

      expect(result.stationPositionVersion).toBe(5);
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          id: VEHICLE_ID,
          organizationId: ORG,
          stationPositionVersion: 4,
        },
        data: {
          currentStationId: STATION_ID,
          stationPositionVersion: { increment: 1 },
        },
      });
    });
  });

  describe('home-fleet delta expectedVersions', () => {
    const vehicles = new Map([
      [
        VEHICLE_ID,
        {
          id: VEHICLE_ID,
          organizationId: ORG,
          homeStationId: null,
          currentStationId: null,
          expectedStationId: null,
          stationPositionVersion: 2,
          status: 'AVAILABLE',
        },
      ],
    ]);

    const prisma = {
      station: {
        findFirst: jest.fn(async () => ({
          id: STATION_ID,
          organizationId: ORG,
          status: 'ACTIVE',
          name: 'A',
        })),
      },
      vehicle: {
        findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => {
          const ids = where.id?.in ?? [];
          return ids
            .map((id) => vehicles.get(id))
            .filter((vehicle): vehicle is NonNullable<typeof vehicle> => !!vehicle);
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => vehicles.get(where.id) ?? null),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new VehicleHomeFleetDeltaService(prisma);

    it('fails per vehicle when expectedVersions mismatch preview snapshot', async () => {
      const result = await service.addVehiclesToHomeStation(ORG, STATION_ID, [VEHICLE_ID], {
        expectedVersions: [{ vehicleId: VEHICLE_ID, expectedVersion: 1 }],
      });

      expect(result.summary).toEqual({ requested: 1, applied: 0, idempotent: 0, failed: 1 });
      expect(result.results[0]?.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.FAILED);
      expect(result.results[0]?.error?.code).toBe(
        StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
      );
      expect(vehicles.get(VEHICLE_ID)?.homeStationId).toBeNull();
    });
  });
});

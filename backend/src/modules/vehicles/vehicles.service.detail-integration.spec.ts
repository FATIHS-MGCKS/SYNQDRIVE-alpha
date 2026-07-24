import { NotFoundException } from '@nestjs/common';
import { CleaningStatus, VehicleStatus } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { FleetMapCacheService } from './fleet-map-cache.service';
import { mockConnectivityRuntime } from './connectivity/connectivity-runtime.test-fixture';
import {
  makeOperationalPrismaMocks,
  makeVehicleRow,
} from './operational/vehicle-operational-state-v2.test-helpers';

const ORG_A = 'org-detail-a';
const VEHICLE_A = 'veh-detail-a';

function makeDetailService(deps: {
  prisma?: Record<string, unknown>;
  dimoAuth?: Record<string, unknown>;
  dimoTelemetry?: Record<string, unknown>;
  dataAuthorizations?: Record<string, unknown>;
  dataAuthEnforcement?: Record<string, unknown>;
  deviceConnectionQuery?: Record<string, unknown>;
  connectivityRuntimeProjection?: Record<string, unknown>;
} = {}): VehiclesService {
  const stub = (): unknown => ({});
  const prisma = deps.prisma ?? {};
  const dimoAuth = deps.dimoAuth ?? { getVehicleJwt: jest.fn() };
  const dimoTelemetry = deps.dimoTelemetry ?? { fetchLastSeenLocation: jest.fn() };
  const dataAuthorizations = deps.dataAuthorizations ?? {
    ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
  };
  const dataAuthEnforcement = deps.dataAuthEnforcement ?? {
    assertDataAuthorization: jest.fn().mockResolvedValue({ id: 'auth-1' }),
  };
  const deviceConnectionQuery = deps.deviceConnectionQuery ?? {
    getVehicleSummary: jest.fn().mockResolvedValue({
      vehicleId: VEHICLE_A,
      lteR1Capable: true,
      lastWebhookReceivedAt: '2026-07-24T09:00:00.000Z',
    }),
  };
  const connectivityRuntimeProjection = deps.connectivityRuntimeProjection ?? {
    projectForVehicle: jest.fn().mockResolvedValue(
      mockConnectivityRuntime({
        vehicleId: VEHICLE_A,
        organizationId: ORG_A,
        lastProviderObservedAt: '2026-07-24T09:55:00.000Z',
        lastReceivedAt: '2026-07-24T10:00:00.000Z',
      }),
    ),
  };

  return new (VehiclesService as unknown as {
    new (...args: unknown[]): VehiclesService;
  })(
    prisma,
    stub(),
    dimoAuth,
    dimoTelemetry,
    stub(),
    stub(),
    stub(),
    dataAuthorizations,
    dataAuthEnforcement,
    deviceConnectionQuery,
    connectivityRuntimeProjection,
    stub(),
    stub(),
    new FleetMapCacheService({ del: jest.fn() } as never),
  );
}

describe('VehiclesService — vehicle detail integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-24T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('findOne (vehicle detail read)', () => {
    it('scopes query to organizationId and returns null-preserving telemetry', async () => {
      const vehicle = makeVehicleRow({
        id: VEHICLE_A,
        latestState: {
          odometerKm: null,
          evSoc: 0,
          fuelLevelRelative: null,
          latitude: 51.0,
          longitude: 9.0,
          lastSeenAt: new Date('2026-07-24T09:50:00.000Z'),
          speedKmh: null,
          isIgnitionOn: null,
          engineLoad: null,
          coolantTempC: null,
        },
      });
      const findFirst = jest.fn().mockResolvedValue(vehicle);
      const prisma = makeOperationalPrismaMocks({
        vehicle: { findFirst },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const service = makeDetailService({ prisma });

      const result = await service.findOne(ORG_A, VEHICLE_A);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VEHICLE_A, organizationId: ORG_A },
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.odometerKm).toBeNull();
      expect(result!.evSoc).toBe(0);
      expect(result!.fuelPercent).toBeNull();
    });

    it('returns null when vehicle belongs to another organization', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = makeOperationalPrismaMocks({
        vehicle: { findFirst },
      });
      const service = makeDetailService({ prisma });

      const result = await service.findOne(ORG_A, 'veh-foreign');
      expect(result).toBeNull();
    });
  });

  describe('getVehicleWithTelemetry', () => {
    const baseVehicle = {
      id: VEHICLE_A,
      vin: 'WVWZZZ',
      make: 'VW',
      model: 'ID.3',
      year: 2023,
      homeStation: { name: 'Berlin' },
      mileageKm: 10000,
      tankCapacityLiters: 50,
      dimoVehicle: null,
      latestState: {
        latitude: 52.5,
        longitude: 13.4,
        speedKmh: null,
        odometerKm: null,
        evSoc: 0,
        coolantTempC: 0,
        engineLoad: 0,
        brakePadPercent: null,
        tireHealthPercent: null,
        engineOilPercent: null,
        oilLevelRelative: 0,
        lvBatteryVoltage: 12.4,
        isIgnitionOn: false,
        lastSeenAt: new Date('2026-07-20T08:00:00.000Z'),
      },
    };

    it('marks stale position as not live (isLiveTracking false)', async () => {
      const findFirst = jest.fn().mockResolvedValue(baseVehicle);
      const prisma = {
        vehicle: { findFirst },
        vehicleTripDetectionState: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const service = makeDetailService({ prisma });

      const result = await service.getVehicleWithTelemetry(VEHICLE_A, ORG_A);

      expect(result.isLiveTracking).toBe(false);
      expect(result.isFresh).toBe(false);
      expect(result.telemetryFreshness).toBe('offline');
    });

    it('preserves measured zero for evSoc while missing odometer stays absent in raw state path', async () => {
      const findFirst = jest.fn().mockResolvedValue(baseVehicle);
      const prisma = {
        vehicle: { findFirst },
        vehicleTripDetectionState: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const service = makeDetailService({ prisma });

      const result = await service.getVehicleWithTelemetry(VEHICLE_A, ORG_A);
      expect(result.battery).toBe(0);
      expect(result.odometer).toBe(10000);
    });

    it('throws NotFound for manipulated foreign vehicleId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const service = makeDetailService({
        prisma: { vehicle: { findFirst } },
      });

      await expect(
        service.getVehicleWithTelemetry('veh-attacker', ORG_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getLiveGps', () => {
    it('returns DIMO live coordinates with lastSeenAt separate from cache fallback', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: VEHICLE_A,
        dimoVehicle: { tokenId: 999 },
        latestState: { latitude: 50.0, longitude: 8.0 },
      });
      const dimoAuth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
      const dimoTelemetry = {
        fetchLastSeenLocation: jest.fn().mockResolvedValue({
          data: {
            signalsLatest: {
              currentLocationCoordinates: {
                value: { latitude: 52.52, longitude: 13.405 },
                timestamp: '2026-07-24T09:59:00.000Z',
              },
              speed: { value: 0, timestamp: '2026-07-24T09:59:00.000Z' },
              lastSeen: '2026-07-24T09:59:30.000Z',
            },
          },
        }),
      };
      const service = makeDetailService({
        prisma: { vehicle: { findFirst } },
        dimoAuth,
        dimoTelemetry,
      });

      const result = await service.getLiveGps(VEHICLE_A, ORG_A);

      expect(result.source).toBe('dimo');
      expect(result.latitude).toBe(52.52);
      expect(result.longitude).toBe(13.405);
      expect(result.lastSeenAt).toBe('2026-07-24T09:59:30.000Z');
      expect(result.speedKmh).toBe(0);
    });

    it('falls back to cached coordinates when DIMO returns no signals', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: VEHICLE_A,
        dimoVehicle: { tokenId: 999 },
        latestState: { latitude: 50.1, longitude: 8.7 },
      });
      const dimoTelemetry = {
        fetchLastSeenLocation: jest.fn().mockResolvedValue({ data: { signalsLatest: null } }),
      };
      const service = makeDetailService({
        prisma: { vehicle: { findFirst } },
        dimoAuth: { getVehicleJwt: jest.fn().mockResolvedValue('jwt') },
        dimoTelemetry,
      });

      const result = await service.getLiveGps(VEHICLE_A, ORG_A);
      expect(result.source).toBe('cache');
      expect(result.latitude).toBe(50.1);
      expect(result.longitude).toBe(8.7);
    });
  });

  describe('getDeviceConnection', () => {
    it('returns connectivity runtime with providerObservedAt vs receivedAt preserved', async () => {
      const runtime = mockConnectivityRuntime({
        vehicleId: VEHICLE_A,
        organizationId: ORG_A,
        lastProviderObservedAt: '2026-07-24T09:55:00.000Z',
        lastReceivedAt: '2026-07-24T10:00:00.000Z',
      });
      const connectivityRuntimeProjection = {
        projectForVehicle: jest.fn().mockResolvedValue(runtime),
      };
      const deviceConnectionQuery = {
        getVehicleSummary: jest.fn().mockResolvedValue({
          vehicleId: VEHICLE_A,
          lteR1Capable: true,
          dimoTokenId: null,
          maskedDimoTokenId: '123…789',
        }),
      };
      const service = makeDetailService({
        deviceConnectionQuery,
        connectivityRuntimeProjection,
      });

      const result = await service.getDeviceConnection(ORG_A, VEHICLE_A);

      expect(deviceConnectionQuery.getVehicleSummary).toHaveBeenCalledWith(
        ORG_A,
        VEHICLE_A,
        { eventLimit: 20 },
      );
      expect(result.connectivityRuntime.lastProviderObservedAt).toBe(
        '2026-07-24T09:55:00.000Z',
      );
      expect(result.connectivityRuntime.lastReceivedAt).toBe('2026-07-24T10:00:00.000Z');
      expect(JSON.stringify(result)).not.toContain('tokenId');
    });
  });

  describe('update (status persistence)', () => {
    it('persists status mutation via prisma.update after org-scoped existence check', async () => {
      const existing = { id: VEHICLE_A, organizationId: ORG_A, status: VehicleStatus.AVAILABLE };
      const updated = {
        ...existing,
        status: VehicleStatus.IN_SERVICE,
        cleaningStatus: CleaningStatus.NEEDS_CLEANING,
      };
      const findFirst = jest.fn().mockResolvedValue(existing);
      const update = jest.fn().mockResolvedValue(updated);
      const service = makeDetailService({
        prisma: { vehicle: { findFirst, update } },
      });

      const result = await service.update(
        VEHICLE_A,
        { status: VehicleStatus.IN_SERVICE, cleaningStatus: CleaningStatus.NEEDS_CLEANING },
        ORG_A,
      );

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: VEHICLE_A, organizationId: ORG_A },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: VEHICLE_A },
        data: {
          status: VehicleStatus.IN_SERVICE,
          cleaningStatus: CleaningStatus.NEEDS_CLEANING,
        },
      });
      expect(result.status).toBe(VehicleStatus.IN_SERVICE);
      expect(result.cleaningStatus).toBe(CleaningStatus.NEEDS_CLEANING);
    });
  });
});

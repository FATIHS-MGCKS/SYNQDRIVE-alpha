import { VehicleStatus } from '@prisma/client';
import {
  classifyTelemetryFreshness,
  interpretVehicleState,
} from '../vehicle-state-interpreter';
import { VehiclesService } from '../vehicles.service';
import {
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — data quality fail-closed', () => {
  it('never uses Available as error fallback for ghost RENTED raw status', () => {
    const service = makeOperationalVehiclesService();
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Available');
    expect(result.bookingDto.activeBookingId).toBeNull();
    expect(result.bookingDto.activeCustomerName).toBeNull();
  });

  it('returns empty booking map when prisma booking query throws (degraded read)', async () => {
    const bookingFindMany = jest.fn().mockRejectedValue(new Error('timeout'));
    const service = makeOperationalVehiclesService({
      prisma: {
        booking: { findMany: bookingFindMany },
      },
    });
    const map = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(map.size).toBe(0);
  });

  it('classifies missing telemetry as no_signal (UNAVAILABLE path on frontend)', () => {
    expect(classifyTelemetryFreshness(null)).toBe('no_signal');
    const interpreted = interpretVehicleState(
      {
        lastSeenAt: null,
        speedKmh: null,
        isIgnitionOn: null,
        engineLoad: null,
        tractionBatteryPowerKw: null,
        coolantTempC: null,
        odometerKm: null,
      },
      null,
    );
    expect(interpreted.telemetryFreshness).toBe('no_signal');
    expect(interpreted.onlineStatus).toBe('OFFLINE');
  });

  it('classifies delayed telemetry as signal_delayed (DEGRADED path on frontend)', () => {
    const lastSeen = new Date(Date.now() - 30 * 60 * 60 * 1000);
    expect(classifyTelemetryFreshness(lastSeen)).toBe('signal_delayed');
  });

  it('getFleetMapData survives redis read failure and still queries DB', async () => {
    const vehicle = {
      id: 'veh-1',
      licensePlate: 'B-XY 1',
      vehicleName: 'Test',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      status: VehicleStatus.AVAILABLE,
      fuelType: 'GASOLINE',
      healthStatus: 'GOOD',
      cleaningStatus: 'CLEAN',
      imageUrl: null,
      tankCapacityLiters: 50,
      homeStationId: 'st-1',
      currentStationId: null,
      expectedStationId: null,
      homeStation: { id: 'st-1', name: 'Berlin' },
      latestState: null,
    };

    const findMany = jest.fn().mockResolvedValue([vehicle]);
    const redisGet = jest.fn().mockRejectedValue(new Error('redis timeout'));
    const redisSet = jest.fn().mockResolvedValue('OK');

    const service = makeOperationalVehiclesService({
      prisma: {
        vehicle: { findMany },
        vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        station: { findMany: jest.fn().mockResolvedValue([]) },
        bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
      },
      redis: { get: redisGet, set: redisSet },
    });

    const rows = await service.getFleetMapData('org-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('Available');
    expect(findMany).toHaveBeenCalled();
  });
});

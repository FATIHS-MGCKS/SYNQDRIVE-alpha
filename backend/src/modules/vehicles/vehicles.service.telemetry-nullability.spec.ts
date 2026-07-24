import { VehiclesService } from './vehicles.service';

function makeServiceWithPrisma(prisma: Record<string, unknown>): VehiclesService {
  const stub = (): any => ({});
  const service = new (VehiclesService as any)(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
  return service;
}

describe('VehiclesService.getVehicleWithTelemetry — null-preserving scalars (Prompt 10/36)', () => {
  it('returns null for missing telemetry instead of coercing to zero', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-1',
          vin: 'VIN1',
          make: 'VW',
          model: 'Golf',
          year: 2024,
          mileageKm: 99_999,
          tankCapacityLiters: 50,
          homeStation: { name: 'Berlin' },
          dimoVehicle: null,
          latestState: {
            lastSeenAt: new Date(Date.now() - 2 * 60_000),
            speedKmh: null,
            odometerKm: null,
            fuelLevelRelative: null,
            fuelLevelAbsolute: null,
            evSoc: null,
            coolantTempC: null,
            brakePadPercent: null,
            tireHealthPercent: null,
            engineOilPercent: null,
            oilLevelRelative: null,
            lvBatteryVoltage: null,
            engineLoad: null,
            rangeKm: null,
            tractionBatteryTemperatureC: null,
            isIgnitionOn: null,
            latitude: null,
            longitude: null,
            rawPayloadJson: null,
          },
        }),
      },
      vehicleTripDetectionState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = makeServiceWithPrisma(prisma);
    const result = await service.getVehicleWithTelemetry('veh-1', 'org-1');

    expect(result.speed).toBeNull();
    expect(result.odometer).toBeNull();
    expect(result.odometerKm).toBeNull();
    expect(result.fuel).toBeNull();
    expect(result.fuelPercent).toBeNull();
    expect(result.battery).toBeNull();
    expect(result.evSoc).toBeNull();
    expect(result.coolant).toBeNull();
    expect(result.lvBatteryVoltage).toBeNull();
    expect(result.engineLoad).toBeNull();
    expect(result.rangeKm).toBeNull();
    expect(result.tractionBatteryTemperatureC).toBeNull();
    expect(result.heading).toBeNull();
    expect(result.accuracyM).toBeNull();
    expect(result.displaySpeed).toBeNull();
  });

  it('preserves measured zero values and does not fall back to vehicle.mileageKm', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-2',
          vin: 'VIN2',
          make: 'VW',
          model: 'ID.3',
          year: 2025,
          mileageKm: 55_000,
          tankCapacityLiters: null,
          homeStation: { name: 'Munich' },
          dimoVehicle: null,
          latestState: {
            lastSeenAt: new Date(Date.now() - 2 * 60_000),
            speedKmh: 0,
            odometerKm: 0,
            fuelLevelRelative: null,
            fuelLevelAbsolute: null,
            evSoc: 0,
            coolantTempC: 0,
            brakePadPercent: 0,
            tireHealthPercent: 0,
            engineOilPercent: 0,
            oilLevelRelative: 0,
            lvBatteryVoltage: 12.4,
            engineLoad: 0,
            rangeKm: 0,
            tractionBatteryTemperatureC: 22,
            isIgnitionOn: false,
            latitude: 48.1,
            longitude: 11.5,
            rawPayloadJson: { heading: 180, accuracy: 6 },
          },
        }),
      },
      vehicleTripDetectionState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = makeServiceWithPrisma(prisma);
    const result = await service.getVehicleWithTelemetry('veh-2', 'org-1');

    expect(result.speed).toBe(0);
    expect(result.odometer).toBe(0);
    expect(result.odometerKm).toBe(0);
    expect(result.battery).toBe(0);
    expect(result.evSoc).toBe(0);
    expect(result.coolant).toBe(0);
    expect(result.rangeKm).toBe(0);
    expect(result.displaySpeed).toBe(0);
    expect(result.heading).toBe(180);
    expect(result.accuracyM).toBe(6);
    expect(result.odometer).not.toBe(55_000);
  });
});

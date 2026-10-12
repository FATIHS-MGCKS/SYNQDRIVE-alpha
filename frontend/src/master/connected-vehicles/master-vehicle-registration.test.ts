import { describe, expect, it, vi } from 'vitest';
import {
  applyManualBaselinesAfterCreate,
  buildVehicleExtraData,
  buildVehicleManualSpecs,
  mapApiDimoToDimoVehicle,
} from './master-vehicle-registration';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: { upsertTires: vi.fn().mockResolvedValue({}) },
    vehicleIntelligence: {
      createBatterySpec: vi.fn().mockResolvedValue({}),
      brakeHealthInitialize: vi.fn().mockResolvedValue({}),
    },
  },
}));
import type { RegisteredVehicle } from '../data/platform-data';

function minimalRv(overrides: Partial<RegisteredVehicle> = {}): RegisteredVehicle {
  return {
    id: 'rv-1',
    vehicleName: 'VW ID.4',
    vin: 'WVWZZZ1JZXW000001',
    make: 'Volkswagen',
    model: 'ID.4',
    year: 2024,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 12000,
    licensePlate: 'B-AB 123',
    vehicleType: 'SUV',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    tireFrontDimension: '235/55 R19',
    tireFrontBrandModel: '',
    tireFrontSeason: 'All Season',
    tireFrontDot: '',
    tireFrontLoadIndex: '',
    tireFrontSpeedIndex: '',
    tireBackDimension: '',
    tireBackBrandModel: '',
    tireBackSeason: 'All Season',
    tireBackDot: '',
    tireBackLoadIndex: '',
    tireBackSpeedIndex: '',
    treadDepthFL: '6',
    treadDepthFR: '',
    treadDepthBL: '',
    treadDepthBR: '',
    brakeFrontRotorDiameter: '',
    brakeFrontRotorWidth: '',
    brakeFrontPadThickness: '10',
    brakeBackRotorDiameter: '',
    brakeBackRotorWidth: '',
    brakeBackPadThickness: '',
    idleRpm: '',
    maxRpm: '',
    drivetrain: '',
    brakeForceDistribution: '',
    frontToRearWeightDistribution: '',
    curbWeight: '',
    serviceIntervals: '',
    serviceIntervalManufacturerKm: '',
    serviceIntervalManufacturerMonths: '',
    oilChangeIntervalKm: '',
    oilChangeIntervalMonths: '',
    lastTuev: '',
    lastBokraft: '',
    lastInspection: '',
    lastOilChange: '',
    lastBrakePadChange: '',
    lastBrakeRotorChange: '',
    hardwareType: 'UNKNOWN',
    ...overrides,
  };
}

describe('master-vehicle-registration payloads', () => {
  it('maps DIMO API rows to DimoVehicle', () => {
    const mapped = mapApiDimoToDimoVehicle({
      id: 'd1',
      vin: 'VIN1',
      make: 'BMW',
      model: 'i3',
      year: 2022,
      odometer: 5000,
      connectionStatus: 'Connected',
    });
    expect(mapped.id).toBe('d1');
    expect(mapped.vin).toBe('VIN1');
    expect(mapped.connectionStatus).toBe('Connected');
  });

  it('builds extraData with org-scoped mileage and hardware', () => {
    const extra = buildVehicleExtraData(minimalRv({ hardwareType: 'LTE_R1', mileage: 1500 }));
    expect(extra.mileageKm).toBe(1500);
    expect(extra.hardwareType).toBe('LTE_R1');
    expect(extra.licensePlate).toBe('B-AB 123');
  });

  it('applyManualBaselinesAfterCreate calls tire, battery, and brake APIs', async () => {
    await applyManualBaselinesAfterCreate(
      'org-1',
      'veh-1',
      minimalRv({ batteryType: 'AGM', batteryAmpere: '70', batteryVolt: '12' }),
    );
    expect(api.vehicles.upsertTires).toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBatterySpec).toHaveBeenCalled();
    expect(api.vehicleIntelligence.brakeHealthInitialize).toHaveBeenCalled();
  });

  it('builds manualSpecs when brake or tire data present', () => {
    const specs = buildVehicleManualSpecs(minimalRv());
    expect(specs?.brakes).toBeTruthy();
    expect(specs?.tires).toBeTruthy();
    expect((specs?.tires as { treadFL?: number }).treadFL).toBe(6);
  });
});

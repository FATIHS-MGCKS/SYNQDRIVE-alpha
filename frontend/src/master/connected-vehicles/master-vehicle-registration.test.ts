import { describe, expect, it, vi } from 'vitest';
import {
  applyManualBaselinesAfterCreate,
  buildVehicleExtraData,
  buildVehicleManualSpecs,
  mapApiDimoToDimoVehicle,
  persistMasterRegisteredVehicle,
} from './master-vehicle-registration';
import { api } from '../../lib/api';

const createMock = vi.fn();
const registerFromDimoMock = vi.fn();
const upsertTiresMock = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      create: (...args: unknown[]) => createMock(...args),
      registerFromDimo: (...args: unknown[]) => registerFromDimoMock(...args),
      upsertTires: (...args: unknown[]) => upsertTiresMock(...args),
    },
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
    expect(upsertTiresMock).toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBatterySpec).toHaveBeenCalled();
    expect(api.vehicleIntelligence.brakeHealthInitialize).toHaveBeenCalled();
  });

  it('builds manualSpecs when brake or tire data present', () => {
    const specs = buildVehicleManualSpecs(minimalRv());
    expect(specs?.brakes).toBeTruthy();
    expect(specs?.tires).toBeTruthy();
    expect((specs?.tires as { treadFL?: number }).treadFL).toBe(6);
  });

  it('persistMasterRegisteredVehicle returns vehicleId when baselines fail (partial success)', async () => {
    createMock.mockResolvedValueOnce({ id: 'veh-partial-1' });
    upsertTiresMock.mockRejectedValueOnce(new Error('tires API down'));

    const result = await persistMasterRegisteredVehicle(minimalRv());

    expect(result.vehicleId).toBe('veh-partial-1');
    expect(result.baselineFailures?.some((f) => f.area === 'tires')).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('persistMasterRegisteredVehicle propagates register-from-dimo full success', async () => {
    registerFromDimoMock.mockResolvedValueOnce({
      vehicle: { id: 'veh-dimo-1' },
    });

    const result = await persistMasterRegisteredVehicle(minimalRv(), {
      dimoVehicleId: 'dimo-abc',
    });

    expect(result.vehicleId).toBe('veh-dimo-1');
    expect(result.postActivationEnrichment).toBeUndefined();
    expect(registerFromDimoMock).toHaveBeenCalledTimes(1);
  });

  it('persistMasterRegisteredVehicle surfaces tire enrichment partial success from register-from-dimo', async () => {
    registerFromDimoMock.mockResolvedValueOnce({
      vehicle: { id: 'veh-dimo-2' },
      postActivationEnrichment: {
        tireTread: { status: 'FAILED', message: 'tire service unavailable' },
      },
    });

    const result = await persistMasterRegisteredVehicle(minimalRv(), {
      dimoVehicleId: 'dimo-xyz',
    });

    expect(result.vehicleId).toBe('veh-dimo-2');
    expect(result.postActivationEnrichment?.tireTread?.status).toBe('FAILED');
    expect(result.postActivationEnrichment?.tireTread?.message).toContain('unavailable');
  });
});

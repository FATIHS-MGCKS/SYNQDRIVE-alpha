import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyManualBaselinesAfterCreate,
  buildMasterHvCapacityExtraFields,
  buildMasterVehicleUpdatePatch,
  buildVehicleExtraData,
  buildVehicleManualSpecs,
  mapAdminVehicleDtoToRegisteredVehicle,
  mapApiDimoToDimoVehicle,
  persistMasterRegisteredVehicle,
  updateMasterRegisteredVehicle,
} from './master-vehicle-registration';
import { api } from '../../lib/api';

const createMock = vi.fn();
const registerFromDimoMock = vi.fn();
const upsertTiresMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('includes motion physics fields in extraData when set', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        curbWeight: '1800',
        systemMotorPowerKw: '150',
        accel0To100S: '5.4',
        motionPhysicsVariantAssumption: 'base variant',
      }),
    );
    expect(extra).toMatchObject({
      curbWeightKg: 1800,
      systemMotorPowerKw: 150,
      accel0To100S: 5.4,
      motionPhysicsVariantAssumption: 'base variant',
    });
  });

  it('builds extraData with org-scoped mileage and hardware', () => {
    const extra = buildVehicleExtraData(minimalRv({ hardwareType: 'LTE_R1', mileage: 1500 }));
    expect(extra.mileageKm).toBe(1500);
    expect(extra.hardwareType).toBe('LTE_R1');
    expect(extra.licensePlate).toBe('B-AB 123');
  });

  it('includes separated HV usable and gross fields for BEV extraData', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        hvBatteryUsableCapacityKwh: '55.2',
        hvBatteryGrossCapacityKwh: '57',
      }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBe(55.2);
    expect(extra.hvBatteryGrossCapacityKwh).toBe(57);
    expect(extra.hvBatteryCapacityKwh).toBeUndefined();
  });

  it('maps legacy hvBatteryCapacityKwh to usable-only extra field', () => {
    const extra = buildVehicleExtraData(
      minimalRv({ hvBatteryCapacityKwh: '57', hvBatteryUsableCapacityKwh: '' }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBe(57);
    expect(extra.hvBatteryGrossCapacityKwh).toBeUndefined();
  });

  it('omits HV capacity extra fields for ICE fuel types', () => {
    const fields = buildMasterHvCapacityExtraFields(
      minimalRv({ fuelType: 'Gasoline', hvBatteryUsableCapacityKwh: '60' }),
    );
    expect(fields).toEqual({});
  });

  it('does not promote gross-only to usable in extraData', () => {
    const extra = buildVehicleExtraData(
      minimalRv({ hvBatteryGrossCapacityKwh: '60', hvBatteryUsableCapacityKwh: '' }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBeUndefined();
    expect(extra.hvBatteryGrossCapacityKwh).toBe(60);
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

  it('persistMasterRegisteredVehicle forwards HV usable in registerFromDimo extraData', async () => {
    registerFromDimoMock.mockResolvedValueOnce({ vehicle: { id: 'veh-hv-1' } });
    await persistMasterRegisteredVehicle(
      minimalRv({ hvBatteryUsableCapacityKwh: '55.2', hvBatteryGrossCapacityKwh: '57' }),
      { dimoVehicleId: 'dimo-hv' },
    );
    expect(registerFromDimoMock).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        dimoVehicleId: 'dimo-hv',
        extraData: expect.objectContaining({
          hvBatteryUsableCapacityKwh: 55.2,
          hvBatteryGrossCapacityKwh: 57,
        }),
      }),
    );
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

  it('buildMasterVehicleUpdatePatch omits UI-only fields and maps drivetrain', () => {
    const patch = buildMasterVehicleUpdatePatch(
      minimalRv({
        drivetrain: 'AWD',
        curbWeight: '1900',
        systemMotorPowerKw: '150',
        accel0To100S: '7.1',
        frontToRearWeightDistribution: '55',
      }),
    );
    expect(patch).toMatchObject({
      make: 'Volkswagen',
      driveType: 'AWD',
      curbWeightKg: 1900,
      frontWeightDistributionPct: 55,
    });
    expect(patch).not.toHaveProperty('systemMotorPowerKw');
    expect(patch).not.toHaveProperty('accel0To100S');
    expect(patch).not.toHaveProperty('tireFrontDimension');
  });

  it('mapAdminVehicleDtoToRegisteredVehicle preserves motion physics form fields', () => {
    const rv = mapAdminVehicleDtoToRegisteredVehicle({
      id: 'v-1',
      organizationId: 'org-1',
      make: 'BMW',
      model: 'i4',
      year: 2023,
      fuelType: 'Electric',
      curbWeight: '2100',
      systemMotorPowerKw: '250',
      accel0To100S: '5.7',
      motionPhysicsVariantAssumption: 'M50',
    });
    expect(rv.systemMotorPowerKw).toBe('250');
    expect(rv.motionPhysicsVariantAssumption).toBe('M50');
  });

  it('updateMasterRegisteredVehicle PATCHes narrow scalar payload only', async () => {
    updateMock.mockResolvedValueOnce({});
    upsertTiresMock.mockResolvedValueOnce({});

    await updateMasterRegisteredVehicle(
      minimalRv({ make: 'VW', model: 'Golf', curbWeight: '1400', mileage: 5000 }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      'org-1',
      'rv-1',
      expect.objectContaining({
        make: 'VW',
        model: 'Golf',
        curbWeightKg: 1400,
        mileageKm: 5000,
      }),
    );
    expect(updateMock.mock.calls[0][2]).not.toHaveProperty('vin');
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

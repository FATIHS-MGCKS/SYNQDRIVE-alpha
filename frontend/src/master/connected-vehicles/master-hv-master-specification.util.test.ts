import { describe, expect, it } from 'vitest';
import {
  buildHvMasterSpecPatchFromRegisteredVehicle,
  extractHvMasterSpecFormFields,
} from './master-hv-master-specification.util';
import type { RegisteredVehicle } from '../data/platform-data';

function minimalRv(overrides: Partial<RegisteredVehicle> = {}): RegisteredVehicle {
  return {
    id: 'v-1',
    vehicleName: 'Tesla',
    vin: 'VIN',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 0,
    licensePlate: '',
    vehicleType: 'SEDAN',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    hvBatteryCapacityKwh: '57',
    tireFrontDimension: '',
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
    treadDepthFL: '',
    treadDepthFR: '',
    treadDepthBL: '',
    treadDepthBR: '',
    tireCondition: '',
    brakeFrontRotorDiameter: '',
    brakeFrontRotorWidth: '',
    brakeFrontPadThickness: '',
    brakeBackRotorDiameter: '',
    brakeBackRotorWidth: '',
    brakeBackPadThickness: '',
    idleRpm: '',
    maxRpm: '',
    drivetrain: '',
    brakeForceDistribution: '',
    frontToRearWeightDistribution: '',
    curbWeight: '1760',
    systemMotorPowerKw: '',
    accel0To100S: '',
    motionPhysicsVariantAssumption: '',
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
    hardwareType: 'LTE_R1',
    ...overrides,
  };
}

describe('master-hv-master-specification.util', () => {
  it('extractHvMasterSpecFormFields reads extended HV fields', () => {
    const fields = extractHvMasterSpecFormFields(
      minimalRv({ hvBatteryChemistry: 'LFP', hvBatteryGrossCapacityKwh: '60' }),
    );
    expect(fields.hvBatteryChemistry).toBe('LFP');
    expect(fields.hvBatteryGrossCapacityKwh).toBe('60');
  });

  it('buildHvMasterSpecPatchFromRegisteredVehicle sets ESTIMATED provenance', () => {
    const baseline = minimalRv();
    const current = minimalRv({ hvBatteryChemistry: 'LFP' });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toEqual({ chemistry: 'LFP', provenance: 'ESTIMATED' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildHvMasterSpecPatchFromRegisteredVehicle,
  extractHvMasterSpecFormFields,
  TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE,
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

  it('first Tesla catalog save includes ESTIMATED evidence metadata', () => {
    const baseline = minimalRv();
    const current = minimalRv({ hvBatteryChemistry: 'LFP', hvBatteryGrossCapacityKwh: '60' });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toMatchObject({
      chemistry: 'LFP',
      grossCapacityKwh: 60,
      provenance: 'ESTIMATED',
      variantLabel: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.variantLabel,
      evidenceNote: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.evidenceNote,
    });
    expect(patch?.catalogReferences).toEqual([
      ...TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.catalogReferences,
    ]);
  });

  it('CONFIRMED baseline edit does not send provenance downgrade', () => {
    const baseline = minimalRv({
      hvMasterSpecificationProvenance: 'CONFIRMED',
      hvBatteryChemistry: 'LFP',
    });
    const current = minimalRv({
      hvMasterSpecificationProvenance: 'CONFIRMED',
      hvBatteryChemistry: 'NMC',
    });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toEqual({ chemistry: 'NMC' });
    expect(patch?.provenance).toBeUndefined();
  });

  it('ESTIMATED baseline edit does not re-send provenance', () => {
    const baseline = minimalRv({
      hvMasterSpecificationProvenance: 'ESTIMATED',
      hvBatteryChemistry: 'LFP',
    });
    const current = minimalRv({
      hvMasterSpecificationProvenance: 'ESTIMATED',
      hvBatteryChemistry: 'NMC',
    });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toEqual({ chemistry: 'NMC' });
    expect(patch?.provenance).toBeUndefined();
  });
});

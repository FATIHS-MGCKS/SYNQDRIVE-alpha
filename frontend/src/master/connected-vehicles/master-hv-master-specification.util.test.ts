import { describe, expect, it } from 'vitest';
import {
  buildHvMasterSpecPatchFromRegisteredVehicle,
  extractHvMasterSpecFormFields,
  HV_CATALOG_VARIANT_KEYS,
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

  it('Model 3 RWD with explicit CATL-6L catalog variant includes ESTIMATED evidence', () => {
    const baseline = minimalRv({ motionPhysicsVariantAssumption: 'RWD' });
    const current = minimalRv({
      motionPhysicsVariantAssumption: 'RWD',
      hvMasterSpecificationCatalogVariantKey: HV_CATALOG_VARIANT_KEYS.TESLA_MODEL3_RWD_LFP_CATL6L,
      hvBatteryChemistry: 'LFP',
      hvBatteryGrossCapacityKwh: '60',
    });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toMatchObject({
      chemistry: 'LFP',
      grossCapacityKwh: 60,
      catalogVariantKey: HV_CATALOG_VARIANT_KEYS.TESLA_MODEL3_RWD_LFP_CATL6L,
      provenance: 'ESTIMATED',
      variantLabel: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.variantLabel,
      evidenceNote: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.evidenceNote,
    });
    expect(patch?.catalogReferences).toEqual([
      ...TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.catalogReferences,
    ]);
    expect(patch?.variantLabel).toContain('not pack-verified');
  });

  it('Model 3 Long Range without explicit catalog variant does not attach CATL-6L evidence', () => {
    const baseline = minimalRv({ motionPhysicsVariantAssumption: 'Long Range' });
    const current = minimalRv({
      motionPhysicsVariantAssumption: 'Long Range',
      hvBatteryChemistry: 'NMC',
      hvBatteryGrossCapacityKwh: '75',
    });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch).toMatchObject({
      chemistry: 'NMC',
      grossCapacityKwh: 75,
      provenance: 'ESTIMATED',
    });
    expect(patch?.variantLabel).toBeUndefined();
    expect(patch?.evidenceNote).toBeUndefined();
    expect(patch?.catalogReferences).toBeUndefined();
    expect(patch?.catalogVariantKey).toBeUndefined();
  });

  it('Model 3 Performance without explicit catalog variant does not attach CATL-6L evidence', () => {
    const baseline = minimalRv({ motionPhysicsVariantAssumption: 'Performance' });
    const current = minimalRv({
      motionPhysicsVariantAssumption: 'Performance',
      hvBatteryChemistry: 'NMC',
      hvBatteryGrossCapacityKwh: '82',
    });
    const patch = buildHvMasterSpecPatchFromRegisteredVehicle(current, baseline);
    expect(patch?.chemistry).toBe('NMC');
    expect(patch?.variantLabel).toBeUndefined();
    expect(patch?.catalogReferences).toBeUndefined();
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

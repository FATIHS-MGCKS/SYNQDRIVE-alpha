import { FuelType } from '@prisma/client';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  buildHmOnlyTechnicalBaselineDraft,
  hmOnlyFuelRequiresHvBatteryEvidence,
  normalizeHmOnlyFuelType,
} from './hm-only-canonical-registration.mapper';

describe('hm-only-canonical-registration.mapper (battery provenance)', () => {
  it('returns empty technical baseline without fabricated HV reference by default', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'electric',
    });
    expect(draft.hvBatteryReference).toBeUndefined();
    expect(draft.version).toBe(2);
  });

  it('does not invent MANUAL_VERIFIED for EV without operator evidence', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'ELECTRIC',
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('does not invent reference for PHEV without operator evidence', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'plugin_hybrid',
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('keeps unknown baseline for gasoline (no HV block)', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'gasoline',
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('includes HV reference only when capacity and allowed source are both provided', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'electric',
      hvBatteryUsableCapacityKwh: 64,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
    });
    expect(draft.hvBatteryReference).toMatchObject({
      capacityKwh: 64,
      source: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
    });
  });

  it('rejects capacity without source (no synthetic provenance)', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      hvBatteryUsableCapacityKwh: 77,
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('rejects disallowed source even when capacity present', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      hvBatteryUsableCapacityKwh: 77,
      hvBatteryReferenceSource: 'VEHICLE_MASTER',
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('flags EV/PHEV fuel classes for HV evidence requirement', () => {
    expect(hmOnlyFuelRequiresHvBatteryEvidence('electric')).toBe(true);
    expect(hmOnlyFuelRequiresHvBatteryEvidence('PLUGIN_HYBRID')).toBe(true);
    expect(hmOnlyFuelRequiresHvBatteryEvidence('gasoline')).toBe(false);
    expect(normalizeHmOnlyFuelType('electric')).toBe(FuelType.ELECTRIC);
  });
});
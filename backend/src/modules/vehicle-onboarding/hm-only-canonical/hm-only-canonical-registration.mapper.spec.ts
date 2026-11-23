import { FuelType } from '@prisma/client';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  buildHmOnlyTechnicalBaselineDraft,
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

  it('does not invent MANUFACTURER_VERIFIED for EV without evidence', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'ELECTRIC',
      hvBatteryUsableCapacityKwh: 64,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
    });
    expect(draft.hvBatteryReference).toBeUndefined();
  });

  it('includes governed reference when document evidence is attached', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      hmVehicleId: 'hm-1',
      organizationId: 'org-a',
      fuelType: 'electric',
      hvBatteryUsableCapacityKwh: 64,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      hvBatteryReferenceDocumentId: 'doc-1',
    });
    expect(draft.hvBatteryReference).toMatchObject({
      capacityKwh: 64,
      source: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      documentId: 'doc-1',
    });
  });

  it('parses operator fuel types for identity capture', () => {
    expect(normalizeHmOnlyFuelType('electric')).toBe(FuelType.ELECTRIC);
    expect(normalizeHmOnlyFuelType('not-a-fuel')).toBeNull();
  });
});
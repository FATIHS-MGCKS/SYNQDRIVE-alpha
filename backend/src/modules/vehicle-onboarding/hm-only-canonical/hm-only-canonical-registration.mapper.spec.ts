import { FuelType } from '@prisma/client';
import { BatteryReferenceCapacitySource, BatteryReferenceCapacityType } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  buildHmOnlyTechnicalBaselineDraft,
  normalizeHmOnlyFuelType,
} from './hm-only-canonical-registration.mapper';

describe('hm-only-canonical-registration.mapper (battery provenance)', () => {
  it('returns empty technical baseline without HV reference when unresolved', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft(undefined);
    expect(draft.hvBatteryReference).toBeUndefined();
    expect(draft.version).toBe(2);
  });

  it('embeds resolved HV reference into technical baseline draft', () => {
    const draft = buildHmOnlyTechnicalBaselineDraft({
      capacityKwh: 64,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      documentId: 'doc-1',
      serviceEventId: null,
    });
    expect(draft.hvBatteryReference).toMatchObject({
      capacityKwh: 64,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      documentId: 'doc-1',
    });
  });

  it('parses operator fuel types for identity capture', () => {
    expect(normalizeHmOnlyFuelType('electric')).toBe(FuelType.ELECTRIC);
    expect(normalizeHmOnlyFuelType('not-a-fuel')).toBeNull();
  });
});
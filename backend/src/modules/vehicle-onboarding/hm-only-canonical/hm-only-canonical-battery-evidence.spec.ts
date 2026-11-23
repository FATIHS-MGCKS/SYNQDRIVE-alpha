import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { buildGovernedHmOnlyHvBatteryReference } from './hm-only-canonical-battery-evidence';

const base = { hmVehicleId: 'hm-1', organizationId: 'org-a' };

describe('hm-only-canonical-battery-evidence', () => {
  it('rejects forged MANUFACTURER_VERIFIED without document evidence', () => {
    expect(
      buildGovernedHmOnlyHvBatteryReference({
        ...base,
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      }),
    ).toBeUndefined();
  });

  it('rejects allowed enum without evidence attachments', () => {
    expect(
      buildGovernedHmOnlyHvBatteryReference({
        ...base,
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.BMS_REPORT,
      }),
    ).toBeUndefined();
  });

  it('rejects MANUAL_VERIFIED capacity without evidence (no self-attested proof)', () => {
    expect(
      buildGovernedHmOnlyHvBatteryReference({
        ...base,
        hvBatteryUsableCapacityKwh: 77,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      }),
    ).toBeUndefined();
  });

  it('accepts governed reference with document evidence', () => {
    const ref = buildGovernedHmOnlyHvBatteryReference({
      ...base,
      hvBatteryUsableCapacityKwh: 64,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      hvBatteryReferenceDocumentId: 'doc-evidence-1',
    });
    expect(ref).toMatchObject({
      capacityKwh: 64,
      source: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      documentId: 'doc-evidence-1',
    });
  });
});
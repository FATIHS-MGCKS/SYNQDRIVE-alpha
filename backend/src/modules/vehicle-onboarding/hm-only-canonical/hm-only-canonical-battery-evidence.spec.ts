import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { buildGovernedHmOnlyHvBatteryReference } from './hm-only-canonical-battery-evidence';

const base = { hmVehicleId: 'hm-1', organizationId: 'org-a' };

describe('hm-only-canonical-battery-evidence (sync test helper)', () => {
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

  it('rejects serviceEventId (unsupported on onboarding contract)', () => {
    expect(
      buildGovernedHmOnlyHvBatteryReference({
        ...base,
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
        hvBatteryReferenceServiceEventId: 'evt-1',
      }),
    ).toBeUndefined();
  });

  it('sync builder never returns high-trust sources (async substantiation required)', () => {
    expect(
      buildGovernedHmOnlyHvBatteryReference({
        ...base,
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
        hvBatteryReferenceDocumentId: 'doc-evidence-1',
      }),
    ).toBeUndefined();
  });

  it('sync builder allows MANUAL_VERIFIED shape when document id present', () => {
    const ref = buildGovernedHmOnlyHvBatteryReference({
      ...base,
      hvBatteryUsableCapacityKwh: 64,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      hvBatteryReferenceDocumentId: 'doc-evidence-1',
    });
    expect(ref?.source).toBe(BatteryReferenceCapacitySource.MANUAL_VERIFIED);
  });
});
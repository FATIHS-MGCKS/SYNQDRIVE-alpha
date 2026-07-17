import {
  hasRepairApplied,
  mergeRepairMetadata,
  snapshotsAreIdentical,
} from './battery-data-repair.util';

describe('battery-data-repair.util', () => {
  it('detects prior repair metadata', () => {
    const container = {
      batteryDataRepair: {
        actionId: 'mark_rest_measurement_unverified',
        appliedAt: '2026-07-01T00:00:00Z',
        scriptVersion: '1.0.0',
      },
    };
    expect(hasRepairApplied(container, 'mark_rest_measurement_unverified')).toBe(true);
    expect(hasRepairApplied(container, 'dedupe_hv_snapshots')).toBe(false);
  });

  it('merges repair metadata without dropping existing keys', () => {
    const merged = mergeRepairMetadata(
      { foo: 'bar' },
      {
        scriptVersion: '1.0.0',
        actionId: 'reclassify_lv_soh_percent_evidence',
        appliedAt: '2026-07-01T00:00:00Z',
      },
    );
    expect(merged.foo).toBe('bar');
    expect(merged.batteryDataRepair).toMatchObject({
      actionId: 'reclassify_lv_soh_percent_evidence',
    });
  });

  it('requires strict identity for HV snapshot dedupe', () => {
    const base = {
      socPercent: 55,
      energyUsedKwh: 40,
      estimatedCapacityKwh: 77,
      sohPercent: 98,
      providerSohPercent: 97,
      idempotencyKey: 'hv:abc',
      recordedAt: new Date('2026-07-01T12:00:00Z'),
    };
    expect(snapshotsAreIdentical(base, { ...base })).toBe(true);
    expect(snapshotsAreIdentical(base, { ...base, socPercent: 56 })).toBe(false);
  });
});

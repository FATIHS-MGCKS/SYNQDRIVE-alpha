import {
  buildBucketValueSnapshots,
  compareValueSnapshots,
  hashBucketValueContent,
  normalizeSignalValue,
} from './reference-capture-settlement-shadow-value-snapshot';

describe('reference-capture-settlement-shadow-value-snapshot', () => {
  it('normalizes numeric and boolean values deterministically', () => {
    expect(normalizeSignalValue(42)).toBe('42');
    expect(normalizeSignalValue(42.5)).toBe('42.5');
    expect(normalizeSignalValue(true)).toBe('true');
    expect(normalizeSignalValue(null)).toBe('null');
  });

  it('builds bucket snapshots from provider rows', () => {
    const snapshots = buildBucketValueSnapshots({
      rows: [{ timestamp: '2026-09-10T12:00:00.000Z', speed: 55 }],
      providerFields: ['speed'],
    });
    expect(snapshots['speed|2026-09-10T12:00:00.000Z']).toBe('55');
  });

  it('hashBucketValueContent excludes query metadata', () => {
    const snapshots = buildBucketValueSnapshots({
      rows: [{ timestamp: '2026-09-10T12:00:00.000Z', speed: 55 }],
      providerFields: ['speed'],
    });
    const hashA = hashBucketValueContent(snapshots);
    const hashB = hashBucketValueContent({ ...snapshots });
    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it('detects VALUE_REVISED when normalized value changes', () => {
    const prior = { 'speed|2026-09-10T12:00:00.000Z': '55' };
    const current = { 'speed|2026-09-10T12:00:00.000Z': '56' };
    const cmp = compareValueSnapshots(current, prior);
    expect(cmp.revisionCount).toBe(1);
    expect(cmp.revisedBuckets[0].priorValue).toBe('55');
    expect(cmp.revisedBuckets[0].revisedValue).toBe('56');
  });

  it('treats identical bucket + value as stable', () => {
    const prior = { 'speed|2026-09-10T12:00:00.000Z': '55' };
    const cmp = compareValueSnapshots(prior, prior);
    expect(cmp.revisionCount).toBe(0);
    expect(cmp.stableBucketIdentities).toEqual(['speed|2026-09-10T12:00:00.000Z']);
  });
});

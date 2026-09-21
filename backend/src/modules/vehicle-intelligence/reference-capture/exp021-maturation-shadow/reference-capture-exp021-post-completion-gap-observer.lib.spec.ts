import {
  compareLocusSets,
  computeGapMetricsFromManifest,
  findFirstStableSnapshot,
  mergeLaneManifests,
  shouldMarkSnapshotMissed,
} from './reference-capture-exp021-post-completion-gap-observer.lib';

describe('exp021 post-completion gap observer lib', () => {
  it('merges lane manifests uniquely', () => {
    const merged = mergeLaneManifests([
      ['speed|2026-09-21T11:14:00.000Z'],
      ['speed|2026-09-21T11:14:00.000Z', 'obdEngineLoad|2026-09-21T11:14:01.000Z'],
    ]);
    expect(merged).toHaveLength(2);
  });

  it('computes gap metrics from manifest', () => {
    const m = computeGapMetricsFromManifest([
      'speed|2026-09-21T11:14:00.000Z',
      'speed|2026-09-21T11:14:03.000Z',
      'speed|2026-09-21T11:14:10.000Z',
    ]);
    expect(m.temporalBucketCount).toBe(3);
    expect(m.maxGapMs).toBe(7000);
    expect(m.gapsGt2s).toBe(2);
  });

  it('detects gap reduction when max gap shrinks', () => {
    const before = ['speed|2026-09-21T11:14:00.000Z', 'speed|2026-09-21T11:14:11.000Z'];
    const after = [
      'speed|2026-09-21T11:14:00.000Z',
      'speed|2026-09-21T11:14:05.000Z',
      'speed|2026-09-21T11:14:11.000Z',
    ];
    const d = compareLocusSets(before, after);
    expect(d.newLoci).toBe(1);
    expect(d.gapReductionOccurred).toBe(true);
  });

  it('finds first stable snapshot label', () => {
    const stable = findFirstStableSnapshot([
      { label: 'S0', status: 'COMPLETE', manifest: ['a|1', 'b|2'] },
      { label: 'S1', status: 'COMPLETE', manifest: ['a|1', 'b|2'] },
      { label: 'S2', status: 'COMPLETE', manifest: ['a|1', 'b|2', 'c|3'] },
      { label: 'S3', status: 'COMPLETE', manifest: ['a|1', 'b|2', 'c|3'] },
    ]);
    expect(stable).toBe('S2');
  });

  it('marks missed only after grace window', () => {
    expect(shouldMarkSnapshotMissed(35_000, 30_000, 5_000)).toBe(false);
    expect(shouldMarkSnapshotMissed(36_000, 30_000, 5_000)).toBe(true);
  });
});

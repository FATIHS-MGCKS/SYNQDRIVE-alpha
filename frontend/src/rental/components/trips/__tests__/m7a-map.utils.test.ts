import { describe, expect, it } from 'vitest';
import type { TripM7aMapPayload } from '../m7a-map.types';
import type { TripMotionMapPayload } from '../motion-map.types';
import { findM7aPointForBucketLabel, isM7aMapActive, resolveM7aMotionBinding } from '../m7a-map.utils';

const baseM7a = (overrides: Partial<TripM7aMapPayload> = {}): TripM7aMapPayload => ({
  status: 'SUCCEEDED',
  previewLabel: 'M7A Straßenzuordnung · vorläufig',
  runId: 'r1',
  workItemId: 'w1',
  discoveryIntentKey: 'd',
  runIntentKey: 'run',
  summary: null,
  pinnedSnapshotHash: 'snap-a',
  combinedInputIdentity: 'input-a',
  osmSnapshotSha256: 'osm',
  computedAtUtc: '2026-01-01T00:00:00.000Z',
  geometrySource: 'POSITION_ANCHOR',
  geometryNote: null,
  mapPoints: [
    {
      bucketLabelUtc: '2026-01-01T10:00:00.000Z',
      outcome: 'CONFIRMED',
      osmWayId: 42,
      headingDeg: 10,
      candidateWayIds: [42],
      ambiguityReasons: [],
      availability: 'PRESENT',
      latitude: 51,
      longitude: 9,
      positionResolved: true,
    },
  ],
  outcomeSummary: { bucketCount: 1, confirmedCount: 1, ambiguousCount: 0, unknownCount: 0 },
  limitations: [],
  failureCode: null,
  ...overrides,
});

const baseMotion = (overrides: Partial<TripMotionMapPayload> = {}): TripMotionMapPayload => ({
  status: 'SUCCEEDED',
  previewLabel: 'S4 Motion · vorläufig',
  runId: 'm1',
  workItemId: 'w1',
  pinnedSnapshotHash: 'snap-a',
  combinedInputIdentity: 'input-a',
  algorithmVersions: null,
  computedAtUtc: null,
  geometrySource: 'MOTION_POSITION_GRID',
  geometryNote: null,
  samples: [],
  events: [],
  stopEpisodes: [],
  limitations: [],
  failureCode: null,
  snapshotBindingVerified: true,
  newerFailedRunId: null,
  newerFailedRunStatus: null,
  ...overrides,
});

describe('m7a-map.utils', () => {
  it('detects active map when position anchors exist', () => {
    expect(isM7aMapActive(baseM7a())).toBe(true);
    expect(isM7aMapActive(baseM7a({ geometrySource: 'NONE', mapPoints: [] }))).toBe(false);
  });

  it('requires matching snapshot hash for combined motion view', () => {
    const binding = resolveM7aMotionBinding(
      baseMotion({ pinnedSnapshotHash: 'snap-b' }),
      baseM7a(),
    );
    expect(binding.compatible).toBe(false);
    expect(binding.reasonKey).toBe('trips.m7aMap.bindingSnapshotMismatch');
  });

  it('returns m7a point only when binding is compatible', () => {
    const m7a = baseM7a();
    const compatible = resolveM7aMotionBinding(baseMotion(), m7a);
    const point = findM7aPointForBucketLabel(m7a, '2026-01-01T10:00:00.000Z', compatible);
    expect(point?.osmWayId).toBe(42);

    const incompatible = resolveM7aMotionBinding(baseMotion({ pinnedSnapshotHash: 'other' }), m7a);
    expect(findM7aPointForBucketLabel(m7a, '2026-01-01T10:00:00.000Z', incompatible)).toBeNull();
  });
});

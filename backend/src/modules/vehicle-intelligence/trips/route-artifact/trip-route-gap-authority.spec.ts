import {
  resolvePersistedGapCount,
  splitMeasuredPointsByGapAuthority,
} from './trip-route-gap-authority';

function waypointLine(count: number, startMs = 0): {
  geometry: [number, number][];
  timestamps: string[];
} {
  const geometry: [number, number][] = [];
  const timestamps: string[] = [];
  for (let i = 0; i < count; i++) {
    geometry.push([13.4 + i * 0.001, 52.5 + i * 0.001]);
    timestamps.push(new Date(startMs + i * 60_000).toISOString());
  }
  return { geometry, timestamps };
}

describe('trip-route-gap-authority', () => {
  it('uses persisted gap count even when runtime timestamp gaps differ', () => {
    const { geometry, timestamps } = waypointLine(6);
    const split = splitMeasuredPointsByGapAuthority({
      geometry,
      timestamps,
      diagnostics: {
        gaps: [
          {
            afterFilteredPointIndex: 1,
            beforeFilteredPointIndex: 2,
            gapSeconds: 600,
            continuity: 'UNKNOWN',
          },
          {
            afterFilteredPointIndex: 3,
            beforeFilteredPointIndex: 4,
            gapSeconds: 900,
            continuity: 'UNKNOWN',
          },
        ],
      },
    });

    expect(split.gapAuthority).toBe('persisted');
    expect(split.gapCount).toBe(2);
    expect(split.segments).toEqual([geometry]);
  });

  it('never applies filtered gap indices to waypoint geometry', () => {
    const { geometry, timestamps } = waypointLine(5);
    const split = splitMeasuredPointsByGapAuthority({
      geometry,
      timestamps,
      diagnostics: {
        gaps: [
          {
            afterFilteredPointIndex: 1,
            beforeFilteredPointIndex: 2,
            gapSeconds: 240,
            continuity: 'UNKNOWN',
          },
        ],
      },
    });

    expect(split.segments).toEqual([geometry]);
    expect(split.gapCount).toBe(1);
  });

  it('derives runtime gap boundaries for legacy data without diagnostics', () => {
    const geometry: [number, number][] = [
      [13.4, 52.5],
      [13.41, 52.51],
      [13.42, 52.52],
      [13.43, 52.53],
    ];
    const timestamps = [
      '2026-08-29T10:00:00.000Z',
      '2026-08-29T10:01:00.000Z',
      '2026-08-29T10:06:00.000Z',
      '2026-08-29T10:07:00.000Z',
    ];

    const split = splitMeasuredPointsByGapAuthority({
      geometry,
      timestamps,
      diagnostics: {},
      gapThresholdSeconds: 180,
    });

    expect(split.gapAuthority).toBe('runtime');
    expect(split.gapCount).toBe(1);
    expect(split.segments).toEqual([geometry.slice(0, 2), geometry.slice(2)]);
  });

  it('resolves persisted gap count from gapCount field', () => {
    expect(resolvePersistedGapCount({ gapCount: 3 })).toBe(3);
    expect(resolvePersistedGapCount({ gaps: [], gapCount: 2 })).toBe(2);
    expect(resolvePersistedGapCount({})).toBeNull();
  });
});

import { downsampleWaypoints } from './waypoint-downsample';

describe('downsampleWaypoints', () => {
  it('keeps first and last points with 30s spacing', () => {
    const points = [
      { recordedAt: new Date('2026-06-25T10:00:00.000Z') },
      { recordedAt: new Date('2026-06-25T10:00:05.000Z') },
      { recordedAt: new Date('2026-06-25T10:00:35.000Z') },
      { recordedAt: new Date('2026-06-25T10:01:10.000Z') },
    ];

    const out = downsampleWaypoints(points, 30_000);
    expect(out).toHaveLength(3);
    expect(out[0].recordedAt.toISOString()).toBe('2026-06-25T10:00:00.000Z');
    expect(out[1].recordedAt.toISOString()).toBe('2026-06-25T10:00:35.000Z');
    expect(out[2].recordedAt.toISOString()).toBe('2026-06-25T10:01:10.000Z');
  });

  it('returns single-point arrays unchanged', () => {
    const points = [{ recordedAt: new Date('2026-06-25T10:00:00.000Z') }];
    expect(downsampleWaypoints(points)).toEqual(points);
  });
});

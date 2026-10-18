import { latLonToLocalMeters, pointToSegmentDistanceM } from '../osm-parse';

describe('pointToSegmentDistanceM (local equirectangular V2)', () => {
  const a = { lat: 51.0, lon: 9.0 };
  const b = { lat: 51.0, lon: 9.001 };

  it('midpoint on segment is ~0m', () => {
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    const d = pointToSegmentDistanceM(mid.lat, mid.lon, a, b);
    expect(d).toBeLessThan(0.05);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('known lateral offset ~5m north of east-west segment', () => {
    const northM = 5;
    const p = latLonToLocalMeters(a.lat + northM / 111_320, a.lon, a.lat, a.lon);
    const d = pointToSegmentDistanceM(a.lat + northM / 111_320, a.lon, a, b);
    expect(d).toBeGreaterThan(4.5);
    expect(d).toBeLessThan(5.5);
    expect(p.y).toBeCloseTo(northM, 0);
  });

  it('point beyond segment end uses nearest endpoint', () => {
    const beyond = { lat: a.lat, lon: a.lon - 0.002 };
    const dSeg = pointToSegmentDistanceM(beyond.lat, beyond.lon, a, b);
    const dA = Math.hypot(
      latLonToLocalMeters(beyond.lat, beyond.lon, a.lat, a.lon).x,
      latLonToLocalMeters(beyond.lat, beyond.lon, a.lat, a.lon).y,
    );
    expect(dSeg).toBeCloseTo(dA, 0);
    expect(dSeg).toBeGreaterThan(50);
  });

  it('degenerate short segment uses min distance to endpoints', () => {
    const c = { lat: 52.1, lon: 10.2 };
    const d = { lat: 52.10000001, lon: 10.20000001 };
    const p = { lat: 52.1005, lon: 10.2005 };
    const dist = pointToSegmentDistanceM(p.lat, p.lon, c, d);
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(80);
  });

  it('is deterministic for identical inputs', () => {
    const p = { lat: 51.0002, lon: 9.0003 };
    const d1 = pointToSegmentDistanceM(p.lat, p.lon, a, b);
    const d2 = pointToSegmentDistanceM(p.lat, p.lon, a, b);
    expect(d1).toBe(d2);
    expect(Number.isFinite(d1)).toBe(true);
  });
});

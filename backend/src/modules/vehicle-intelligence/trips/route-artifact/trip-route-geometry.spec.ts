import {
  isValidLngLatPair,
  parseTripRouteGeometryJson,
  serializeTripRouteGeometry,
} from './trip-route-geometry';

describe('trip-route-geometry', () => {
  it('M — structural contract: TripRouteLngLat is [longitude, latitude] (index 0 = lng, index 1 = lat)', () => {
    expect(isValidLngLatPair([13.4, 52.5])).toBe(true);
    const parsed = parseTripRouteGeometryJson([[13.404954, 52.520008]]);
    expect(parsed).toEqual([[13.404954, 52.520008]]);
    expect(parsed![0][0]).toBe(13.404954);
    expect(parsed![0][1]).toBe(52.520008);
    const serialized = serializeTripRouteGeometry([[13.404954, 52.520008]]);
    expect(serialized![0]).toEqual([13.404954, 52.520008]);
  });

  it('L — invalid geometry rejected', () => {
    expect(() => parseTripRouteGeometryJson({})).toThrow(/array/);
    expect(() => parseTripRouteGeometryJson([[200, 52]])).toThrow(/index 0/);
    expect(() => parseTripRouteGeometryJson([[13, 100]])).toThrow(/index 0/);
    expect(() => parseTripRouteGeometryJson([[0, 0]])).toThrow(/index 0/);
    expect(isValidLngLatPair(null)).toBe(false);
    expect(isValidLngLatPair([13])).toBe(false);
  });

  it('serializeTripRouteGeometry validates on write', () => {
    const geometry = serializeTripRouteGeometry([
      [13.4, 52.5],
      [13.41, 52.51],
    ]);
    expect(geometry).toHaveLength(2);
  });
});

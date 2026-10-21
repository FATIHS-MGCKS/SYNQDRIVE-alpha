import {
  buildTripRouteInputFingerprintInput,
  canonicalizeTripRouteInputPoints,
  computeTripRouteInputFingerprint,
} from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';

const BASE_POINTS = [
  { latitude: 52.520008, longitude: 13.404954, recordedAt: '2026-08-01T10:00:00.000Z' },
  { latitude: 52.521, longitude: 13.41, recordedAt: '2026-08-01T10:00:07.000Z' },
  { latitude: 52.522, longitude: 13.42, recordedAt: '2026-08-01T10:00:14.000Z' },
];

describe('trip-route-input-fingerprint', () => {
  it('G — repeat input produces identical fingerprint', () => {
    const input = buildTripRouteInputFingerprintInput(
      'trip-1',
      TRIP_ROUTE_ALGORITHM_VERSION,
      BASE_POINTS,
    );
    const a = computeTripRouteInputFingerprint(input);
    const b = computeTripRouteInputFingerprint(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('H — coordinate change changes fingerprint', () => {
    const before = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', TRIP_ROUTE_ALGORITHM_VERSION, BASE_POINTS),
    );
    const after = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', TRIP_ROUTE_ALGORITHM_VERSION, [
        ...BASE_POINTS.slice(0, 2),
        { latitude: 52.523, longitude: 13.43, recordedAt: '2026-08-01T10:00:14.000Z' },
      ]),
    );
    expect(after).not.toBe(before);
  });

  it('I — point order change changes fingerprint when timestamps tie', () => {
    const t = '2026-08-01T10:00:00.000Z';
    const p1 = { latitude: 52.52, longitude: 13.4, recordedAt: t };
    const p2 = { latitude: 52.53, longitude: 13.41, recordedAt: t };
    const order1 = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', TRIP_ROUTE_ALGORITHM_VERSION, [p1, p2]),
    );
    const order2 = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', TRIP_ROUTE_ALGORITHM_VERSION, [p2, p1]),
    );
    expect(order2).not.toBe(order1);
  });

  it('J — algorithm version bump changes fingerprint', () => {
    const v1 = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', 'route-v2-r1', BASE_POINTS),
    );
    const v2 = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput('trip-1', TRIP_ROUTE_ALGORITHM_VERSION, BASE_POINTS),
    );
    expect(v2).not.toBe(v1);
  });

  it('K — fingerprint depends only on tripId, algorithmVersion, and canonical points', () => {
    const input = buildTripRouteInputFingerprintInput(
      'trip-1',
      TRIP_ROUTE_ALGORITHM_VERSION,
      BASE_POINTS,
    );
    const withMetadata = computeTripRouteInputFingerprint(input);
    const withoutTripChange = computeTripRouteInputFingerprint({
      tripId: 'trip-1',
      algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
      points: BASE_POINTS,
    });
    expect(withMetadata).toBe(withoutTripChange);
  });

  it('canonicalizes numeric coordinates to 6 decimal places', () => {
    const canonical = canonicalizeTripRouteInputPoints([
      {
        latitude: 52.5200084999,
        longitude: 13.4049544999,
        recordedAt: '2026-08-01T10:00:00.000Z',
      },
    ]);
    expect(canonical[0].latitude).toBe(52.520008);
    expect(canonical[0].longitude).toBe(13.404954);
  });
});

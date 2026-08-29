import {
  TripRouteArtifactValidationError,
  validateTripRouteArtifactWrite,
} from './trip-route-artifact.validation';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import type { TripRouteArtifactWriteInput } from './trip-route.types';

function baseInput(
  overrides: Partial<TripRouteArtifactWriteInput> = {},
): TripRouteArtifactWriteInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    routeQuality: 'RAW',
    algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
    inputFingerprint: 'abc123',
    sourcePointCount: 10,
    filteredPointCount: 0,
    ...overrides,
  };
}

const LINE: TripRouteArtifactWriteInput['matchedGeometry'] = [
  [13.4, 52.5],
  [13.41, 52.51],
  [13.42, 52.52],
];

describe('trip-route-artifact.validation', () => {
  it('F — RAW artifact does not require geometry fields', () => {
    expect(() => validateTripRouteArtifactWrite(baseInput({ routeQuality: 'RAW' }))).not.toThrow();
  });

  it('D — MATCHED requires matched geometry with >= 2 points', () => {
    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: LINE }),
      ),
    ).not.toThrow();

    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: [[13.4, 52.5]] }),
      ),
    ).toThrow(TripRouteArtifactValidationError);

    expect(() =>
      validateTripRouteArtifactWrite(baseInput({ routeQuality: 'MATCHED' })),
    ).toThrow(/MATCHED route quality requires matchedGeometry/);
  });

  it('E — FILTERED requires filtered geometry with >= 2 points', () => {
    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'FILTERED', filteredGeometry: LINE }),
      ),
    ).not.toThrow();

    expect(() =>
      validateTripRouteArtifactWrite(baseInput({ routeQuality: 'FILTERED' })),
    ).toThrow(/FILTERED route quality requires filteredGeometry/);
  });

  it('N — matchConfidence bounds 0..1', () => {
    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: LINE, matchConfidence: 0.85 }),
      ),
    ).not.toThrow();

    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: LINE, matchConfidence: 1.5 }),
      ),
    ).toThrow(/matchConfidence/);
  });

  it('O — matchCoverage bounds 0..1', () => {
    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: LINE, matchCoverage: 0 }),
      ),
    ).not.toThrow();

    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({ routeQuality: 'MATCHED', matchedGeometry: LINE, matchCoverage: -0.1 }),
      ),
    ).toThrow(/matchCoverage/);
  });

  it('P — counts invariant failedChunkCount <= chunkCount', () => {
    expect(() =>
      validateTripRouteArtifactWrite(
        baseInput({
          routeQuality: 'MATCHED',
          matchedGeometry: LINE,
          chunkCount: 5,
          failedChunkCount: 6,
        }),
      ),
    ).toThrow(/failedChunkCount cannot exceed chunkCount/);
  });
});

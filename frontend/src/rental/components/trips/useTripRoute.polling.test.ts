import { describe, expect, it } from 'vitest';
import type { CanonicalTripRouteResponse } from '../../../lib/api';
import {
  buildRouteCacheKey,
  shouldPollRouteForTesting,
} from './hooks/useTripRoute';

function routeWithState(
  processingState: CanonicalTripRouteResponse['status']['processingState'],
): CanonicalTripRouteResponse {
  return {
    tripId: 'trip-1',
    vehicleId: 'veh-1',
    routeQuality: processingState === 'READY' ? 'RAW' : null,
    geometry: null,
    source: { provider: null, algorithmVersion: null, processedAt: null },
    quality: { matchConfidence: null, matchCoverage: null },
    counts: { sourcePointCount: 0, filteredPointCount: 0, matchedPointCount: null },
    continuity: { status: 'INSUFFICIENT_DATA', hasUnknownGaps: false, gapCount: 0 },
    status: {
      processingState,
      ready: processingState === 'READY',
      retryableFailure: processingState === 'RETRYING',
      failureReason: null,
    },
    speedPoints: [],
  };
}

describe('useTripRoute polling contract', () => {
  it('polls only while processing or retrying', () => {
    expect(shouldPollRouteForTesting(routeWithState('PROCESSING'))).toBe(true);
    expect(shouldPollRouteForTesting(routeWithState('RETRYING'))).toBe(true);
    expect(shouldPollRouteForTesting(routeWithState('READY'))).toBe(false);
    expect(shouldPollRouteForTesting(routeWithState('FAILED'))).toBe(false);
    expect(shouldPollRouteForTesting(routeWithState('UNAVAILABLE'))).toBe(false);
  });

  it('scopes cache keys by organization, vehicle, and trip', () => {
    expect(buildRouteCacheKey('org-a', 'veh-1', 'trip-1')).toBe('org-a:veh-1:trip-1');
    expect(buildRouteCacheKey('org-b', 'veh-1', 'trip-1')).not.toBe(
      buildRouteCacheKey('org-a', 'veh-1', 'trip-1'),
    );
  });
});

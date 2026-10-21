import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { RouteQuality } from '@prisma/client';
import type { RouteProcessingState } from './trip-route-canonical-read.types';

export function recordTripRouteV2CanonicalRead(
  metrics: TripMetricsService,
  input: {
    processingState: RouteProcessingState;
    routeQuality: RouteQuality | null;
    segmentCount: number;
    ready: boolean;
  },
): void {
  metrics.tripRouteV2CanonicalReadTotal.inc({
    processing_state: input.processingState,
    route_quality: input.routeQuality ?? 'none',
    ready: input.ready ? 'true' : 'false',
  });
  if (input.ready && input.segmentCount > 0) {
    metrics.tripRouteV2CanonicalSegmentCount.observe(input.segmentCount);
  }
}

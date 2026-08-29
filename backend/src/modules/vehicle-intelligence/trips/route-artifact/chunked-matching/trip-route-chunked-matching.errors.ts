/** Retryable Mapbox / matching failure — propagate to DRIVING_ROUTE_ENRICH job retry. */
export class TripRouteMatchRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TripRouteMatchRetryableError';
  }
}

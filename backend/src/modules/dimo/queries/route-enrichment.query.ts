/**
 * Route Enrichment — 7-second buckets
 *
 * High-resolution route for map visualization, speeding detection,
 * start/end address geocoding, speed-based heatmap coloring,
 * and road type distribution.
 */
export function buildRouteEnrichmentQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query RouteEnrichment {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "7s"
      ) {
        timestamp
        currentLocationCoordinates(agg: RAND) { latitude longitude }
        speed(agg: AVG)
      }
    }
  `.trim();
}

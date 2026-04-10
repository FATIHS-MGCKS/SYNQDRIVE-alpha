/**
 * Performance — 15-second buckets
 *
 * Engine/powertrain performance metrics for trip details,
 * future scoring, and visualization.
 */
export function buildPerformanceQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query Performance {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "15s"
      ) {
        timestamp
        powertrainCombustionEngineECT(agg: AVG)
        powertrainCombustionEngineSpeed(agg: AVG)
        obdThrottlePosition(agg: AVG)
        obdEngineLoad(agg: AVG)
      }
    }
  `.trim();
}

/**
 * Environment Temperature — 2-minute buckets
 *
 * Outside air temperature for trip details and backend calculations
 * (EV range estimation, brake/tire wear modeling).
 */
export function buildEnvironmentTemperatureQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query EnvironmentTemperature {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "2m"
      ) {
        timestamp
        exteriorAirTemperature(agg: AVG)
      }
    }
  `.trim();
}

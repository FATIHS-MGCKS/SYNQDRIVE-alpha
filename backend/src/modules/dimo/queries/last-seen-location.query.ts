/**
 * GraphQL query for lastSeen + coordinates only.
 *
 * SignalCollection root field is `lastSeen: Time` (not `timestamp`).
 * currentLocationCoordinates is SignalLocation → { timestamp, value { latitude, longitude } }
 */
export function buildLastSeenLocationQuery(tokenId: number): string {
  return `
    query LastSeenLocation {
      signalsLatest(tokenId: ${tokenId}) {
        lastSeen
        currentLocationCoordinates {
          timestamp
          value { latitude longitude }
        }
        speed { timestamp value }
      }
    }
  `.trim();
}

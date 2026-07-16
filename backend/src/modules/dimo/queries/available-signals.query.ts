/**
 * DIMO root `availableSignals(tokenId)` — capability preflight (P29).
 * See docs/audits/dimo-driving-signals-capability.md §20.
 */
export function buildAvailableSignalsQuery(tokenId: number): string {
  return `
    query AvailableSignals {
      availableSignals(tokenId: ${tokenId})
    }
  `.trim();
}

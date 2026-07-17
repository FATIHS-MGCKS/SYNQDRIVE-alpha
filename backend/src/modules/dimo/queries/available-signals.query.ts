/**
 * DIMO root query for vehicle signal capability preflight.
 *
 * `availableSignals` is a separate root field — it is NOT nested under
 * `signalsLatest`. See `docs/audits/dimo-tesla-hv-signal-capability.md` §4.1.
 */
export function buildAvailableSignalsQuery(tokenId: number): string {
  return `
    query AvailableSignals {
      availableSignals(tokenId: ${tokenId})
    }
  `.trim();
}

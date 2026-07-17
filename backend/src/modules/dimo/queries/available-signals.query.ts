/**
 * DIMO root `availableSignals(tokenId)` — capability preflight.
 *
 * `availableSignals` is a separate root field — it is NOT nested under
 * `signalsLatest`. See `docs/audits/dimo-driving-signals-capability.md` and
 * `docs/audits/dimo-tesla-hv-signal-capability.md`.
 */
export function buildAvailableSignalsQuery(tokenId: number): string {
  return `
    query AvailableSignals {
      availableSignals(tokenId: ${tokenId})
    }
  `.trim();
}

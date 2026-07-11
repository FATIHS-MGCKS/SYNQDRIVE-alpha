/** Matches backend `RESOLVED_RECENT_WINDOW_MS` — Behoben tab + badge window. */
export const RESOLVED_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function resolvedRecentFromIso(referenceNowMs = Date.now()): string {
  return new Date(referenceNowMs - RESOLVED_RECENT_WINDOW_MS).toISOString();
}

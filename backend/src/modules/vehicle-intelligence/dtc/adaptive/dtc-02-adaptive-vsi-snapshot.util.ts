/**
 * Read obdDTCList / diagnostic_trouble_code freshness from persisted VSI profile snapshots.
 */
export function extractVsiDiagnosticTroubleCodeLastSourceTimestamp(
  signalsSnapshot: unknown,
): string | null {
  if (!Array.isArray(signalsSnapshot)) {
    return null;
  }
  for (const raw of signalsSnapshot) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const key = row.canonicalSignalKey;
    if (key === 'diagnostic_trouble_code') {
      const ts = row.lastSourceTimestamp;
      return typeof ts === 'string' && ts.length > 0 ? ts : null;
    }
  }
  return null;
}

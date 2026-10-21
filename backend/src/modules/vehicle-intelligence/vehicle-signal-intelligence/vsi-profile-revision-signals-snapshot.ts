/** Pure snapshot shape guard (no resolver/mapper imports). */
export function isVsiProfileRevisionSignalsSnapshotWellFormed(signalsSnapshot: unknown): boolean {
  if (!Array.isArray(signalsSnapshot)) {
    return false;
  }
  for (const raw of signalsSnapshot) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return false;
    }
  }
  return true;
}

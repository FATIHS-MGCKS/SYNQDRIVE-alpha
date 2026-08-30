/**
 * REFUEL-specific reconciliation for overlapping DIMO singleton segments.
 *
 * When a later, expanded detector segment supersedes an earlier partial segment
 * for the same logical refuel, the stale sibling must not remain queryable.
 */

export interface RefuelEventWindow {
  id: string;
  dimoSegmentId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  fuelDeltaPercent: number | null;
  fuelDeltaLiters: number | null;
}

const DIMO_REFUEL_SEGMENT_ID = /^dimo-refuel-(\d+)-(\d+)$/;

export function extractRefuelTokenId(dimoSegmentId: string): number | null {
  const match = dimoSegmentId.match(DIMO_REFUEL_SEGMENT_ID);
  if (!match) return null;
  const tokenId = Number(match[1]);
  return Number.isFinite(tokenId) ? tokenId : null;
}

function overlapSeconds(a: RefuelEventWindow, b: RefuelEventWindow): number {
  const start = Math.max(a.startTime.getTime(), b.startTime.getTime());
  const end = Math.min(a.endTime.getTime(), b.endTime.getTime());
  return Math.max(0, Math.round((end - start) / 1000));
}

function isWindowContainedIn(
  inner: RefuelEventWindow,
  outer: RefuelEventWindow,
): boolean {
  return (
    inner.startTime.getTime() >= outer.startTime.getTime() &&
    inner.endTime.getTime() <= outer.endTime.getTime()
  );
}

function areFuelTransitionsCompatible(
  canonical: RefuelEventWindow,
  sibling: RefuelEventWindow,
): boolean {
  const canonicalPct = canonical.fuelDeltaPercent ?? 0;
  const siblingPct = sibling.fuelDeltaPercent ?? 0;
  if (canonicalPct > 0 && siblingPct > 0) {
    if (siblingPct > canonicalPct * 1.15 + 1) return false;
    if (Math.abs(canonicalPct - siblingPct) > 20) return false;
    return true;
  }

  const canonicalL = canonical.fuelDeltaLiters ?? 0;
  const siblingL = sibling.fuelDeltaLiters ?? 0;
  if (canonicalL > 0 && siblingL > 0) {
    if (siblingL > canonicalL * 1.15 + 0.5) return false;
    return true;
  }

  return canonicalPct > 0 || canonicalL > 0;
}

/**
 * Returns true when `sibling` is a strict subset / partial detector view of
 * `canonical` and should be removed after canonical persistence.
 */
export function shouldSupersedeRefuelSibling(
  canonical: RefuelEventWindow,
  sibling: RefuelEventWindow,
): boolean {
  if (canonical.id === sibling.id) return false;
  if (canonical.dimoSegmentId === sibling.dimoSegmentId) return false;

  const canonicalToken = extractRefuelTokenId(canonical.dimoSegmentId);
  const siblingToken = extractRefuelTokenId(sibling.dimoSegmentId);
  if (canonicalToken == null || siblingToken == null) return false;
  if (canonicalToken !== siblingToken) return false;

  if (canonical.durationSeconds <= sibling.durationSeconds) return false;

  const overlap = overlapSeconds(canonical, sibling);
  if (overlap <= 0) return false;

  const siblingDuration = Math.max(1, sibling.durationSeconds);
  const overlapRatio = overlap / siblingDuration;
  const contained = isWindowContainedIn(sibling, canonical);

  if (!contained && overlapRatio < 0.5) return false;
  if (!areFuelTransitionsCompatible(canonical, sibling)) return false;

  return true;
}

export function resolveSupersededRefuelSiblingIds(
  canonicalEvents: RefuelEventWindow[],
  candidates: RefuelEventWindow[],
): string[] {
  const toDelete = new Set<string>();
  for (const canonical of canonicalEvents) {
    for (const candidate of candidates) {
      if (shouldSupersedeRefuelSibling(canonical, candidate)) {
        toDelete.add(candidate.id);
      }
    }
  }
  return [...toDelete];
}

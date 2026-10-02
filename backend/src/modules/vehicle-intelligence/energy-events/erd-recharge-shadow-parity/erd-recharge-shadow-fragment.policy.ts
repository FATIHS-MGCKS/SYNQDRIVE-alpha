import type {
  ErdRechargeShadowCanonicalCandidate,
  ErdRechargeShadowLegacyCandidate,
  ErdRechargeShadowLegacySnapshot,
} from './erd-recharge-shadow-parity.types';
import type { ErdRechargeShadowPairProposal } from './erd-recharge-shadow-pairing.policy';

function readNativeDimoId(canonical: ErdRechargeShadowCanonicalCandidate): string | null {
  const id = canonical.snapshot.dimoSegmentId ?? canonical.snapshot.draft.dimoSegmentId;
  if (id == null || id.trim() === '') return null;
  return id.trim();
}

function readCoalescedFromSegmentIds(meta: ErdRechargeShadowLegacySnapshot): string[] {
  return meta.coalescedFromSegmentIds ?? [];
}

export function isValidLegacyInterval(snapshot: ErdRechargeShadowLegacySnapshot): boolean {
  const startMs = new Date(snapshot.startTime).getTime();
  const endMs = new Date(snapshot.endTime).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs;
}

/**
 * Strict temporal containment within canonical physical window (fail-closed v1).
 * Identical full boundaries are NOT fragments.
 */
export function isStrictlyContainedLegacyFragment(input: {
  canonical: ErdRechargeShadowCanonicalCandidate;
  legacy: ErdRechargeShadowLegacySnapshot;
}): boolean {
  if (!isValidLegacyInterval(input.legacy)) return false;
  const cStart = input.canonical.snapshot.draft.startTime.getTime();
  const cEnd = input.canonical.snapshot.draft.endTime.getTime();
  const lStart = new Date(input.legacy.startTime).getTime();
  const lEnd = new Date(input.legacy.endTime).getTime();
  if (lStart < cStart || lEnd > cEnd) return false;
  return lStart > cStart || lEnd < cEnd;
}

export function hasStrongLegacyIdentityToCanonical(input: {
  canonical: ErdRechargeShadowCanonicalCandidate;
  legacy: ErdRechargeShadowLegacySnapshot;
}): boolean {
  const nativeDimo = readNativeDimoId(input.canonical);
  if (nativeDimo == null) return false;
  if (input.legacy.dimoSegmentId === nativeDimo) return true;
  return readCoalescedFromSegmentIds(input.legacy).includes(nativeDimo);
}

function hasStrongIdentityConflictWithOtherCanonical(input: {
  ownerCanonicalId: string;
  legacy: ErdRechargeShadowLegacySnapshot;
  canonical: ErdRechargeShadowCanonicalCandidate[];
}): boolean {
  for (const candidate of input.canonical) {
    if (candidate.sessionId === input.ownerCanonicalId) continue;
    if (
      hasStrongLegacyIdentityToCanonical({
        canonical: candidate,
        legacy: input.legacy,
      })
    ) {
      return true;
    }
  }
  return false;
}

function countPrimaryPairedContainmentOwners(input: {
  legacy: ErdRechargeShadowLegacyCandidate;
  pairs: ErdRechargeShadowPairProposal[];
  canonical: ErdRechargeShadowCanonicalCandidate[];
  canonicalById: Map<string, ErdRechargeShadowCanonicalCandidate>;
}): string[] {
  const owners: string[] = [];
  for (const pair of input.pairs) {
    const canonical = input.canonicalById.get(pair.canonical.sessionId);
    if (!canonical) continue;
    if (!isStrictlyContainedLegacyFragment({ canonical, legacy: input.legacy.snapshot })) {
      continue;
    }
    owners.push(pair.canonical.sessionId);
  }
  const uniqueOwners = [...new Set(owners)];
  if (uniqueOwners.length !== 1) {
    return [];
  }
  const ownerId = uniqueOwners[0]!;
  if (
    hasStrongIdentityConflictWithOtherCanonical({
      ownerCanonicalId: ownerId,
      legacy: input.legacy.snapshot,
      canonical: input.canonical,
    })
  ) {
    return [];
  }
  return uniqueOwners;
}

/**
 * After primary P1/P2/P3 pairing, assign proven contained legacy rows as fragment siblings.
 * Requires unique owning primary-paired canonical; fail closed on ambiguity.
 */
export function resolveLegacyFragmentSiblingsByPrimaryPair(input: {
  pairs: ErdRechargeShadowPairProposal[];
  canonical: ErdRechargeShadowCanonicalCandidate[];
  legacy: ErdRechargeShadowLegacyCandidate[];
  pairedLegacyIds: Set<string>;
  ambiguousLegacyIds: string[];
}): Map<string, string[]> {
  const ambiguousLegacy = new Set(input.ambiguousLegacyIds);
  const canonicalById = new Map(input.canonical.map((c) => [c.sessionId, c]));
  const primaryLegacyByCanonical = new Map(
    input.pairs.map((p) => [p.canonical.sessionId, p.legacy.vehicleEnergyEventId]),
  );
  const fragmentMap = new Map<string, string[]>();

  for (const legacyRow of input.legacy) {
    if (input.pairedLegacyIds.has(legacyRow.vehicleEnergyEventId)) continue;
    if (ambiguousLegacy.has(legacyRow.vehicleEnergyEventId)) continue;

    const owners = countPrimaryPairedContainmentOwners({
      legacy: legacyRow,
      pairs: input.pairs,
      canonical: input.canonical,
      canonicalById,
    });
    if (owners.length !== 1) continue;

    const ownerCanonicalId = owners[0]!;
    const primaryLegacyId = primaryLegacyByCanonical.get(ownerCanonicalId);
    if (primaryLegacyId === legacyRow.vehicleEnergyEventId) continue;

    const existing = fragmentMap.get(ownerCanonicalId) ?? [];
    existing.push(legacyRow.vehicleEnergyEventId);
    fragmentMap.set(ownerCanonicalId, existing);
  }

  for (const [canonicalId, ids] of fragmentMap.entries()) {
    fragmentMap.set(canonicalId, [...new Set(ids)].sort());
  }

  return fragmentMap;
}

export function emptyShadowFieldDiffForTopologyDiagnostic(): {
  numericDeltas: {
    startDeltaSeconds: null;
    endDeltaSeconds: null;
    durationDeltaSeconds: null;
    socDeltaDifferencePercent: null;
    energyDeltaDifferenceKwh: null;
    odometerStartDifferenceKm: null;
    odometerEndDifferenceKm: null;
  };
  mismatches: [];
  relatedLegacyVehicleEnergyEventIds: string[];
} {
  return {
    numericDeltas: {
      startDeltaSeconds: null,
      endDeltaSeconds: null,
      durationDeltaSeconds: null,
      socDeltaDifferencePercent: null,
      energyDeltaDifferenceKwh: null,
      odometerStartDifferenceKm: null,
      odometerEndDifferenceKm: null,
    },
    mismatches: [],
    relatedLegacyVehicleEnergyEventIds: [],
  };
}

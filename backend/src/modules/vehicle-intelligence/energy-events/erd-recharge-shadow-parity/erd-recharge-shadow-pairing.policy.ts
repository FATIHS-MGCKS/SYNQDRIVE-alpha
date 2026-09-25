import type {
  ErdRechargeShadowCanonicalCandidate,
  ErdRechargeShadowLegacyCandidate,
  ErdRechargeShadowLegacySnapshot,
} from './erd-recharge-shadow-parity.types';
import { ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE } from './erd-recharge-shadow-parity.types';

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function readCoalescedFromSegmentIds(meta: ErdRechargeShadowLegacySnapshot): string[] {
  return meta.coalescedFromSegmentIds ?? [];
}

export interface ErdRechargeShadowPairProposal {
  canonical: ErdRechargeShadowCanonicalCandidate;
  legacy: ErdRechargeShadowLegacyCandidate;
  pairingEvidence: (typeof ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE)[keyof typeof ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE];
  priority: number;
}

export function proposeExactDimoPairs(
  canonical: ErdRechargeShadowCanonicalCandidate[],
  legacy: ErdRechargeShadowLegacyCandidate[],
): ErdRechargeShadowPairProposal[] {
  const proposals: ErdRechargeShadowPairProposal[] = [];
  for (const c of canonical) {
    const nativeDimo = c.snapshot.dimoSegmentId ?? c.snapshot.draft.dimoSegmentId;
    if (nativeDimo == null || nativeDimo.trim() === '') continue;
    for (const l of legacy) {
      if (l.snapshot.dimoSegmentId === nativeDimo) {
        proposals.push({
          canonical: c,
          legacy: l,
          pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
          priority: 1,
        });
      }
    }
  }
  return proposals;
}

export function proposeCoalescedLineagePairs(
  canonical: ErdRechargeShadowCanonicalCandidate[],
  legacy: ErdRechargeShadowLegacyCandidate[],
): ErdRechargeShadowPairProposal[] {
  const proposals: ErdRechargeShadowPairProposal[] = [];
  for (const c of canonical) {
    const nativeDimo = c.snapshot.dimoSegmentId ?? c.snapshot.draft.dimoSegmentId;
    if (nativeDimo == null || nativeDimo.trim() === '') continue;
    for (const l of legacy) {
      const lineage = readCoalescedFromSegmentIds(l.snapshot);
      if (lineage.includes(nativeDimo)) {
        proposals.push({
          canonical: c,
          legacy: l,
          pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.LEGACY_COALESCED_LINEAGE,
          priority: 2,
        });
      }
    }
  }
  return proposals;
}

export function proposeUniqueWindowPairs(
  canonical: ErdRechargeShadowCanonicalCandidate[],
  legacy: ErdRechargeShadowLegacyCandidate[],
): ErdRechargeShadowPairProposal[] {
  const proposals: ErdRechargeShadowPairProposal[] = [];
  for (const c of canonical) {
    const cStart = c.snapshot.draft.startTime;
    const cEnd = c.snapshot.draft.endTime;
    const overlappingLegacy = legacy.filter((l) =>
      intervalsOverlap(cStart, cEnd, new Date(l.snapshot.startTime), new Date(l.snapshot.endTime)),
    );
    if (overlappingLegacy.length !== 1) continue;
    const l = overlappingLegacy[0]!;
    const overlappingCanonical = canonical.filter((other) =>
      intervalsOverlap(
        other.snapshot.draft.startTime,
        other.snapshot.draft.endTime,
        new Date(l.snapshot.startTime),
        new Date(l.snapshot.endTime),
      ),
    );
    if (overlappingCanonical.length !== 1) continue;
    proposals.push({
      canonical: c,
      legacy: l,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.UNIQUE_PHYSICAL_WINDOW_OVERLAP,
      priority: 3,
    });
  }
  return proposals;
}

/**
 * Deterministic pairing: highest-priority evidence wins; ambiguous multi-match → no pair.
 * Observational only — never product authority.
 */
export function resolveShadowPairings(input: {
  canonical: ErdRechargeShadowCanonicalCandidate[];
  legacy: ErdRechargeShadowLegacyCandidate[];
}): {
  pairs: ErdRechargeShadowPairProposal[];
  ambiguousCanonicalIds: string[];
  ambiguousLegacyIds: string[];
} {
  const all = [
    ...proposeExactDimoPairs(input.canonical, input.legacy),
    ...proposeCoalescedLineagePairs(input.canonical, input.legacy),
    ...proposeUniqueWindowPairs(input.canonical, input.legacy),
  ].sort((a, b) => a.priority - b.priority);

  const byPair = new Map<string, ErdRechargeShadowPairProposal>();
  for (const proposal of all) {
    const key = `${proposal.canonical.sessionId}:${proposal.legacy.vehicleEnergyEventId}`;
    const existing = byPair.get(key);
    if (!existing || proposal.priority < existing.priority) {
      byPair.set(key, proposal);
    }
  }
  const dedupedAll = Array.from(byPair.values());

  const pairedCanonical = new Set<string>();
  const pairedLegacy = new Set<string>();
  const pairs: ErdRechargeShadowPairProposal[] = [];

  const proposalsByCanonical = new Map<string, ErdRechargeShadowPairProposal[]>();
  const proposalsByLegacy = new Map<string, ErdRechargeShadowPairProposal[]>();
  for (const proposal of dedupedAll) {
    proposalsByCanonical.set(proposal.canonical.sessionId, [
      ...(proposalsByCanonical.get(proposal.canonical.sessionId) ?? []),
      proposal,
    ]);
    proposalsByLegacy.set(proposal.legacy.vehicleEnergyEventId, [
      ...(proposalsByLegacy.get(proposal.legacy.vehicleEnergyEventId) ?? []),
      proposal,
    ]);
  }

  const ambiguousCanonicalIds = input.canonical
    .filter((c) => (proposalsByCanonical.get(c.sessionId)?.length ?? 0) > 1)
    .map((c) => c.sessionId);
  const ambiguousLegacyIds = input.legacy
    .filter((l) => (proposalsByLegacy.get(l.vehicleEnergyEventId)?.length ?? 0) > 1)
    .map((l) => l.vehicleEnergyEventId);

  for (const proposal of dedupedAll) {
    if (ambiguousCanonicalIds.includes(proposal.canonical.sessionId)) continue;
    if (ambiguousLegacyIds.includes(proposal.legacy.vehicleEnergyEventId)) continue;
    if (pairedCanonical.has(proposal.canonical.sessionId)) continue;
    if (pairedLegacy.has(proposal.legacy.vehicleEnergyEventId)) continue;
    pairedCanonical.add(proposal.canonical.sessionId);
    pairedLegacy.add(proposal.legacy.vehicleEnergyEventId);
    pairs.push(proposal);
  }

  return { pairs, ambiguousCanonicalIds, ambiguousLegacyIds };
}

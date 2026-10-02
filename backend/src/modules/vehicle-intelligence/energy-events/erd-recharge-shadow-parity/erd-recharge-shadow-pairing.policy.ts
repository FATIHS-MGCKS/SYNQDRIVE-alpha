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

export interface ErdRechargeShadowAmbiguityComponent {
  canonicalSessionIds: string[];
  legacyVehicleEnergyEventIds: string[];
}

function buildAmbiguityComponents(input: {
  dedupedAll: ErdRechargeShadowPairProposal[];
  proposalsByCanonical: Map<string, ErdRechargeShadowPairProposal[]>;
  proposalsByLegacy: Map<string, ErdRechargeShadowPairProposal[]>;
}): ErdRechargeShadowAmbiguityComponent[] {
  const seedCanonical = new Set(
    [...input.proposalsByCanonical.entries()]
      .filter(([, proposals]) => proposals.length > 1)
      .map(([sessionId]) => sessionId),
  );
  const seedLegacy = new Set(
    [...input.proposalsByLegacy.entries()]
      .filter(([, proposals]) => proposals.length > 1)
      .map(([legacyId]) => legacyId),
  );
  if (seedCanonical.size === 0 && seedLegacy.size === 0) {
    return [];
  }

  const canonicalToLegacy = new Map<string, Set<string>>();
  const legacyToCanonical = new Map<string, Set<string>>();
  for (const proposal of input.dedupedAll) {
    const canonicalId = proposal.canonical.sessionId;
    const legacyId = proposal.legacy.vehicleEnergyEventId;
    if (!canonicalToLegacy.has(canonicalId)) {
      canonicalToLegacy.set(canonicalId, new Set());
    }
    canonicalToLegacy.get(canonicalId)!.add(legacyId);
    if (!legacyToCanonical.has(legacyId)) {
      legacyToCanonical.set(legacyId, new Set());
    }
    legacyToCanonical.get(legacyId)!.add(canonicalId);
  }

  const visitedCanonical = new Set<string>();
  const visitedLegacy = new Set<string>();
  const components: ErdRechargeShadowAmbiguityComponent[] = [];

  const walkComponent = (startCanonicalId?: string, startLegacyId?: string): void => {
    const compCanonical = new Set<string>();
    const compLegacy = new Set<string>();
    const stack: Array<{ kind: 'c' | 'l'; id: string }> = [];
    if (startCanonicalId != null) {
      stack.push({ kind: 'c', id: startCanonicalId });
    }
    if (startLegacyId != null) {
      stack.push({ kind: 'l', id: startLegacyId });
    }
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.kind === 'c') {
        if (visitedCanonical.has(node.id)) continue;
        visitedCanonical.add(node.id);
        compCanonical.add(node.id);
        for (const legacyId of canonicalToLegacy.get(node.id) ?? []) {
          if (!visitedLegacy.has(legacyId)) {
            stack.push({ kind: 'l', id: legacyId });
          }
        }
      } else {
        if (visitedLegacy.has(node.id)) continue;
        visitedLegacy.add(node.id);
        compLegacy.add(node.id);
        for (const canonicalId of legacyToCanonical.get(node.id) ?? []) {
          if (!visitedCanonical.has(canonicalId)) {
            stack.push({ kind: 'c', id: canonicalId });
          }
        }
      }
    }
    if (compCanonical.size === 0 && compLegacy.size === 0) {
      return;
    }
    components.push({
      canonicalSessionIds: [...compCanonical].sort(),
      legacyVehicleEnergyEventIds: [...compLegacy].sort(),
    });
  };

  for (const canonicalId of [...seedCanonical].sort()) {
    if (!visitedCanonical.has(canonicalId)) {
      walkComponent(canonicalId, undefined);
    }
  }
  for (const legacyId of [...seedLegacy].sort()) {
    if (!visitedLegacy.has(legacyId)) {
      walkComponent(undefined, legacyId);
    }
  }

  return components.sort((a, b) => {
    const keyA = `${a.canonicalSessionIds.join(',')}|${a.legacyVehicleEnergyEventIds.join(',')}`;
    const keyB = `${b.canonicalSessionIds.join(',')}|${b.legacyVehicleEnergyEventIds.join(',')}`;
    return keyA.localeCompare(keyB);
  });
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
  ambiguityComponents: ErdRechargeShadowAmbiguityComponent[];
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

  const ambiguityComponents = buildAmbiguityComponents({
    dedupedAll,
    proposalsByCanonical,
    proposalsByLegacy,
  });
  const ambiguousCanonicalIds = [
    ...new Set(ambiguityComponents.flatMap((component) => component.canonicalSessionIds)),
  ].sort();
  const ambiguousLegacyIds = [
    ...new Set(ambiguityComponents.flatMap((component) => component.legacyVehicleEnergyEventIds)),
  ].sort();

  for (const proposal of dedupedAll) {
    if (ambiguousCanonicalIds.includes(proposal.canonical.sessionId)) continue;
    if (ambiguousLegacyIds.includes(proposal.legacy.vehicleEnergyEventId)) continue;
    if (pairedCanonical.has(proposal.canonical.sessionId)) continue;
    if (pairedLegacy.has(proposal.legacy.vehicleEnergyEventId)) continue;
    pairedCanonical.add(proposal.canonical.sessionId);
    pairedLegacy.add(proposal.legacy.vehicleEnergyEventId);
    pairs.push(proposal);
  }

  return { pairs, ambiguousCanonicalIds, ambiguousLegacyIds, ambiguityComponents };
}

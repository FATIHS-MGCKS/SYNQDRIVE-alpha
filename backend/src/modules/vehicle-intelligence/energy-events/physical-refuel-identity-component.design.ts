/**
 * G1.2c evidence-safe physical-refuel identity component analysis — pure design only.
 * Pairwise matrix + complete-clique validation; non-transitive components fail closed.
 */
import {
  classifyPhysicalRefuelSibling,
  type PhysicalRefuelIdentityClassification,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';

export type IdentityComponentStatus =
  | 'VALID_COMPLETE_CLIQUE'
  | 'AMBIGUOUS_NON_TRANSITIVE'
  | 'PAIRWISE_INSUFFICIENT'
  | 'MIXED_VEHICLE_BATCH'
  | 'MISSING_OBSERVATION_TIME';

export type IdentityAmbiguityReasonCode =
  | 'non_transitive_identity_component'
  | 'pairwise_identity_insufficient'
  | 'missing_system_observation_time'
  | 'mixed_vehicle_batch'
  | 'late_sibling_after_finalization'
  | 'settlement_window_open'
  | 'canonical_not_stable';

export interface PairwiseIdentityCell {
  classification: PhysicalRefuelIdentityClassification;
  reason: string;
}

export interface PhysicalRefuelIdentityMatrix {
  vehicleId: string;
  candidates: RefuelRowForMatcher[];
  /** Symmetric map keyed by sorted id pair `idA|idB`. */
  pairs: Record<string, PairwiseIdentityCell>;
}

export interface PhysicalRefuelIdentityComponent {
  memberIds: string[];
  members: RefuelRowForMatcher[];
  status: IdentityComponentStatus;
  reasonCodes: IdentityAmbiguityReasonCode[];
  /** True when every pair in the component is SAME_PHYSICAL_REFUEL. */
  isCompleteSameClique: boolean;
}

export interface PhysicalRefuelComponentAnalysis {
  vehicleId: string | null;
  matrix: PhysicalRefuelIdentityMatrix | null;
  components: PhysicalRefuelIdentityComponent[];
  batchStatus: IdentityComponentStatus;
  reasonCodes: IdentityAmbiguityReasonCode[];
}

export function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|');
}

export function buildPairwiseIdentityMatrix(
  candidates: RefuelRowForMatcher[],
): PhysicalRefuelComponentAnalysis {
  if (!candidates.length) {
    return {
      vehicleId: null,
      matrix: null,
      components: [],
      batchStatus: 'VALID_COMPLETE_CLIQUE',
      reasonCodes: [],
    };
  }

  const vehicleIds = new Set(candidates.map((c) => c.vehicleId));
  if (vehicleIds.size > 1) {
    return {
      vehicleId: null,
      matrix: null,
      components: [],
      batchStatus: 'MIXED_VEHICLE_BATCH',
      reasonCodes: ['mixed_vehicle_batch'],
    };
  }

  const vehicleId = candidates[0].vehicleId;
  const pairs: Record<string, PairwiseIdentityCell> = {};

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const result = classifyPhysicalRefuelSibling(a, b);
      const key = pairKey(a.id, b.id);
      pairs[key] = { classification: result.classification, reason: result.reason };
    }
  }

  const matrix: PhysicalRefuelIdentityMatrix = { vehicleId, candidates, pairs };
  const components = partitionIdentityComponents(matrix);

  const batchStatus = components.some((c) => c.status !== 'VALID_COMPLETE_CLIQUE')
    ? components.find((c) => c.status !== 'VALID_COMPLETE_CLIQUE')!.status
    : 'VALID_COMPLETE_CLIQUE';

  const reasonCodes = [
    ...new Set(components.flatMap((c) => c.reasonCodes)),
  ] as IdentityAmbiguityReasonCode[];

  return { vehicleId, matrix, components, batchStatus, reasonCodes };
}

function getPairClassification(
  matrix: PhysicalRefuelIdentityMatrix,
  idA: string,
  idB: string,
): PairwiseIdentityCell {
  if (idA === idB) {
    return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'same_row' };
  }
  return matrix.pairs[pairKey(idA, idB)];
}

/** Connected components via SAME edges only (undirected). */
function sameConnectedComponents(matrix: PhysicalRefuelIdentityMatrix): RefuelRowForMatcher[][] {
  const { candidates } = matrix;
  const visited = new Set<string>();
  const components: RefuelRowForMatcher[][] = [];

  for (const start of candidates) {
    if (visited.has(start.id)) continue;
    const component: RefuelRowForMatcher[] = [];
    const queue = [start];
    visited.add(start.id);

    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const other of candidates) {
        if (visited.has(other.id)) continue;
        const cell = getPairClassification(matrix, current.id, other.id);
        if (cell.classification === 'SAME_PHYSICAL_REFUEL') {
          visited.add(other.id);
          queue.push(other);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function isCompleteSameClique(
  members: RefuelRowForMatcher[],
  matrix: PhysicalRefuelIdentityMatrix,
): { clique: boolean; reasonCodes: IdentityAmbiguityReasonCode[] } {
  const reasonCodes: IdentityAmbiguityReasonCode[] = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const cell = getPairClassification(matrix, members[i].id, members[j].id);
      if (cell.classification === 'INSUFFICIENT_EVIDENCE') {
        reasonCodes.push('pairwise_identity_insufficient');
        return { clique: false, reasonCodes };
      }
      if (cell.classification === 'DISTINCT_PHYSICAL_REFUEL') {
        reasonCodes.push('non_transitive_identity_component');
        return { clique: false, reasonCodes };
      }
    }
  }

  return { clique: true, reasonCodes };
}

function hasBlockingInsufficientWithOutside(
  members: RefuelRowForMatcher[],
  matrix: PhysicalRefuelIdentityMatrix,
): boolean {
  const memberIds = new Set(members.map((m) => m.id));
  for (const member of members) {
    for (const other of matrix.candidates) {
      if (memberIds.has(other.id)) continue;
      const cell = getPairClassification(matrix, member.id, other.id);
      if (cell.classification === 'INSUFFICIENT_EVIDENCE') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Evidence-safe partition: valid groups are complete SAME cliques only.
 * Non-transitive SAME-connected components fail closed — never split by ID order.
 */
export function partitionIdentityComponents(
  matrix: PhysicalRefuelIdentityMatrix,
): PhysicalRefuelIdentityComponent[] {
  const rawComponents = sameConnectedComponents(matrix);
  const results: PhysicalRefuelIdentityComponent[] = [];

  for (const members of rawComponents) {
    const memberIds = members.map((m) => m.id).sort();
    const { clique, reasonCodes } = isCompleteSameClique(members, matrix);

    if (!clique) {
      results.push({
        memberIds,
        members,
        status: reasonCodes.includes('pairwise_identity_insufficient')
          ? 'PAIRWISE_INSUFFICIENT'
          : 'AMBIGUOUS_NON_TRANSITIVE',
        reasonCodes,
        isCompleteSameClique: false,
      });
      continue;
    }

    if (
      members.length > 1 &&
      hasBlockingInsufficientWithOutside(members, matrix)
    ) {
      results.push({
        memberIds,
        members,
        status: 'PAIRWISE_INSUFFICIENT',
        reasonCodes: ['pairwise_identity_insufficient'],
        isCompleteSameClique: true,
      });
      continue;
    }

    results.push({
      memberIds,
      members,
      status: 'VALID_COMPLETE_CLIQUE',
      reasonCodes: [],
      isCompleteSameClique: true,
    });
  }

  return results;
}

/** @deprecated G1.2b greedy partition — use analyzePhysicalRefuelIdentityComponents. */
export function partitionPhysicalRefuelGroups(
  candidates: RefuelRowForMatcher[],
): RefuelRowForMatcher[][] {
  const analysis = buildPairwiseIdentityMatrix(candidates);
  if (!analysis.matrix || analysis.batchStatus !== 'VALID_COMPLETE_CLIQUE') {
    return candidates.map((c) => [c]);
  }
  return analysis.components.map((c) => c.members);
}

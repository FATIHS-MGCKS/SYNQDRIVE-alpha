import type {
  Prisma,
  RawRefuelCandidate,
  VehicleEnergyEvent,
  VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import {
  classifyPhysicalRefuelSibling,
  type RefuelRowForMatcher,
} from '../physical-refuel-identity.matcher';
import {
  isEnrichmentEligibleFinality,
  isV2OwnedRefuelEvent,
} from '../physical-refuel-reconciliation.repository';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { resolveEffectiveV2OwnershipCutoverAt } from '../v2-ownership-cutover.util';
import {
  buildAuthoritativeNativeRefuelSiblingWhere,
  NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL,
  NATIVE_SIBLING_RAW_LOAD_INCOMPLETE_DETAIL,
  PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL,
  RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH,
  MAX_RAW_NATIVE_REFUEL_ROWS_IN_OVERLAP_WINDOW,
} from './raw-refuel-native-fallback-convergence.evaluator';
import { rawRefuelCandidateToRefuelRowForMatcher } from './raw-refuel-native-overlap.advisory';

/** Candidate cannot treat native as absent while physical relationship is uncertain (Stage-4 safety). */
export function nativePhysicalRelationshipImpliesPendingReconciliation(
  candidateRow: RefuelRowForMatcher,
  nativeRow: RefuelRowForMatcher,
): boolean {
  const { classification } = classifyPhysicalRefuelSibling(candidateRow, nativeRow);
  if (classification === 'DISTINCT_PHYSICAL_REFUEL') return false;
  if (classification === 'SAME_PHYSICAL_REFUEL') return true;
  if (classification === 'INSUFFICIENT_EVIDENCE') return true;
  return false;
}

export type AuthoritativeNativeRefuelSiblingLoadStatus =
  | 'OK'
  | 'PENDING_RECONCILIATION'
  | 'AUTHORITY_CONFLICT'
  | 'RAW_LOAD_INCOMPLETE';

export interface AuthoritativeNativeRefuelSiblingLoadResult {
  status: AuthoritativeNativeRefuelSiblingLoadStatus;
  detail: string;
  rawNativeRowCount: number;
  physicalRefuelComponentCount: number;
  authoritativeNativeRows: RefuelRowForMatcher[];
}

type LoadedNativeRefuelEvent = VehicleEnergyEvent & {
  refuelReconciliation: VehicleEnergyEventRefuelReconciliation | null;
};

/**
 * Stage-4 / F5 — resolve persisted Physical Refuel Reconciliation authority over raw
 * DIMO segment revisions. Legacy rows without reconciliation remain matchable when not
 * shadowed by a finalized V2 canonical for the same physical episode.
 */
export function resolveAuthoritativeNativeRefuelSiblingsFromLoaded(input: {
  candidate: RawRefuelCandidate;
  loadedNativeEvents: LoadedNativeRefuelEvent[];
  v2OwnershipCutoverAt?: Date | null;
}): AuthoritativeNativeRefuelSiblingLoadResult {
  const { candidate, loadedNativeEvents } = input;
  const v2OwnershipCutoverAt =
    input.v2OwnershipCutoverAt !== undefined
      ? input.v2OwnershipCutoverAt
      : resolveEffectiveV2OwnershipCutoverAt();
  const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(candidate);
  const rawNativeRowCount = loadedNativeEvents.length;

  const legacyEvents: LoadedNativeRefuelEvent[] = [];
  const v2UnreconciledEvents: LoadedNativeRefuelEvent[] = [];
  const v2ByGroup = new Map<string, LoadedNativeRefuelEvent[]>();

  for (const event of loadedNativeEvents) {
    const recon = event.refuelReconciliation;
    if (!recon) {
      if (isV2OwnedRefuelEvent(event, v2OwnershipCutoverAt)) {
        v2UnreconciledEvents.push(event);
      } else {
        legacyEvents.push(event);
      }
      continue;
    }
    const group = v2ByGroup.get(recon.reconciliationGroupId) ?? [];
    group.push(event);
    v2ByGroup.set(recon.reconciliationGroupId, group);
  }

  const physicalRefuelComponentCount =
    legacyEvents.length + v2UnreconciledEvents.length + v2ByGroup.size;
  const authoritativeV2Rows: RefuelRowForMatcher[] = [];
  let pendingPhysicalMatch = false;

  for (const unreconciled of v2UnreconciledEvents) {
    const row = vehicleEnergyEventToRefuelRow(unreconciled);
    if (nativePhysicalRelationshipImpliesPendingReconciliation(candidateRow, row)) {
      pendingPhysicalMatch = true;
    }
  }

  for (const members of v2ByGroup.values()) {
    const enrichmentFinalMembers = members.filter(
      (member) =>
        member.refuelReconciliation != null &&
        member.refuelReconciliation.enrichmentEligible &&
        isEnrichmentEligibleFinality(member.refuelReconciliation.finalityState),
    );

    if (enrichmentFinalMembers.length > 1) {
      return buildConflictResult(rawNativeRowCount, physicalRefuelComponentCount);
    }

    if (enrichmentFinalMembers.length === 1) {
      const recon = enrichmentFinalMembers[0].refuelReconciliation!;
      if (
        recon.canonicalEventId != null &&
        recon.canonicalEventId !== enrichmentFinalMembers[0].id
      ) {
        return buildConflictResult(rawNativeRowCount, physicalRefuelComponentCount);
      }
      authoritativeV2Rows.push(vehicleEnergyEventToRefuelRow(enrichmentFinalMembers[0]));
      continue;
    }

    const matchesCandidate = members.some((member) => {
      const row = vehicleEnergyEventToRefuelRow(member);
      return nativePhysicalRelationshipImpliesPendingReconciliation(candidateRow, row);
    });
    if (matchesCandidate) {
      pendingPhysicalMatch = true;
    }
  }

  if (pendingPhysicalMatch) {
    return {
      status: 'PENDING_RECONCILIATION',
      detail: NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL,
      rawNativeRowCount,
      physicalRefuelComponentCount,
      authoritativeNativeRows: [],
    };
  }

  const authoritativeLegacyRows: RefuelRowForMatcher[] = [];
  for (const legacy of legacyEvents) {
    const legacyRow = vehicleEnergyEventToRefuelRow(legacy);
    const shadowedByV2 = authoritativeV2Rows.some(
      (v2Row) =>
        classifyPhysicalRefuelSibling(legacyRow, v2Row).classification ===
        'SAME_PHYSICAL_REFUEL',
    );
    if (!shadowedByV2) {
      authoritativeLegacyRows.push(legacyRow);
    }
  }

  const authoritativeNativeRows = [...authoritativeV2Rows, ...authoritativeLegacyRows];

  return {
    status: 'OK',
    detail: 'authoritative_native_siblings_resolved',
    rawNativeRowCount,
    physicalRefuelComponentCount,
    authoritativeNativeRows,
  };
}

export async function loadAuthoritativeNativeRefuelSiblings(
  tx: Prisma.TransactionClient,
  candidate: RawRefuelCandidate,
  window: { start: Date; end: Date },
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthoritativeNativeRefuelSiblingLoadResult> {
  const where = buildAuthoritativeNativeRefuelSiblingWhere(candidate, window);
  const loadedNativeEvents: LoadedNativeRefuelEvent[] = [];
  let cursorId: string | undefined;

  while (true) {
    const batch = await tx.vehicleEnergyEvent.findMany({
      where,
      include: { refuelReconciliation: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH,
      ...(cursorId
        ? {
            skip: 1,
            cursor: { id: cursorId },
          }
        : {}),
    });

    if (batch.length === 0) {
      break;
    }

    loadedNativeEvents.push(...batch);
    if (loadedNativeEvents.length > MAX_RAW_NATIVE_REFUEL_ROWS_IN_OVERLAP_WINDOW) {
      return {
        status: 'RAW_LOAD_INCOMPLETE',
        detail: NATIVE_SIBLING_RAW_LOAD_INCOMPLETE_DETAIL,
        rawNativeRowCount: loadedNativeEvents.length,
        physicalRefuelComponentCount: 0,
        authoritativeNativeRows: [],
      };
    }

    if (batch.length < RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH) {
      break;
    }
    cursorId = batch[batch.length - 1].id;
  }

  return resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
    candidate,
    loadedNativeEvents,
    v2OwnershipCutoverAt: resolveEffectiveV2OwnershipCutoverAt(env),
  });
}

function buildConflictResult(
  rawNativeRowCount: number,
  physicalRefuelComponentCount: number,
): AuthoritativeNativeRefuelSiblingLoadResult {
  return {
    status: 'AUTHORITY_CONFLICT',
    detail: PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL,
    rawNativeRowCount,
    physicalRefuelComponentCount,
    authoritativeNativeRows: [],
  };
}

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
import { isEnrichmentEligibleFinality } from '../physical-refuel-reconciliation.repository';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import {
  AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE,
  buildAuthoritativeNativeRefuelSiblingWhere,
  NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL,
  PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL,
} from './raw-refuel-native-fallback-convergence.evaluator';
import { rawRefuelCandidateToRefuelRowForMatcher } from './raw-refuel-native-overlap.advisory';

export type AuthoritativeNativeRefuelSiblingLoadStatus =
  | 'OK'
  | 'PENDING_RECONCILIATION'
  | 'AUTHORITY_CONFLICT';

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
}): AuthoritativeNativeRefuelSiblingLoadResult {
  const { candidate, loadedNativeEvents } = input;
  const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(candidate);
  const rawNativeRowCount = loadedNativeEvents.length;

  const legacyEvents: LoadedNativeRefuelEvent[] = [];
  const v2ByGroup = new Map<string, LoadedNativeRefuelEvent[]>();

  for (const event of loadedNativeEvents) {
    const recon = event.refuelReconciliation;
    if (!recon) {
      legacyEvents.push(event);
      continue;
    }
    const group = v2ByGroup.get(recon.reconciliationGroupId) ?? [];
    group.push(event);
    v2ByGroup.set(recon.reconciliationGroupId, group);
  }

  const physicalRefuelComponentCount = legacyEvents.length + v2ByGroup.size;
  const authoritativeV2Rows: RefuelRowForMatcher[] = [];
  let pendingPhysicalMatch = false;

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
      return (
        classifyPhysicalRefuelSibling(candidateRow, row).classification ===
        'SAME_PHYSICAL_REFUEL'
      );
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

  return {
    status: 'OK',
    detail: 'authoritative_native_siblings_resolved',
    rawNativeRowCount,
    physicalRefuelComponentCount,
    authoritativeNativeRows: [...authoritativeV2Rows, ...authoritativeLegacyRows],
  };
}

export async function loadAuthoritativeNativeRefuelSiblings(
  tx: Prisma.TransactionClient,
  candidate: RawRefuelCandidate,
  window: { start: Date; end: Date },
): Promise<AuthoritativeNativeRefuelSiblingLoadResult> {
  const loadedNativeEvents = await tx.vehicleEnergyEvent.findMany({
    where: buildAuthoritativeNativeRefuelSiblingWhere(candidate, window),
    include: { refuelReconciliation: true },
    orderBy: { startTime: 'asc' },
    take: AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE,
  });

  return resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
    candidate,
    loadedNativeEvents,
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

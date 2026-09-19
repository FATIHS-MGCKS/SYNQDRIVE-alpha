import type { RawRefuelCandidate } from '@prisma/client';
import type { RefuelRowForMatcher } from '../physical-refuel-identity.matcher';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import {
  rawRefuelCandidateToRefuelRowForMatcher,
  type ClassifyRawRefuelNativeOverlapInput,
} from './raw-refuel-native-overlap.advisory';
import type { RawRefuelNativeFallbackConvergenceEvaluation } from './raw-refuel-native-fallback-convergence.types';

/** Bounded authoritative native sibling load — overflow MUST fail closed (F5-PR1.1). */
export const MAX_AUTHORITATIVE_NATIVE_SIBLINGS = 32;

export const NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL = 'native_sibling_limit_exceeded';

export const NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL =
  'native_physical_reconciliation_not_final';

export const PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL =
  'physical_refuel_authority_conflict';

/** Sentinel query size: load MAX+1 to detect overflow without silent truncation. */
export const AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE =
  MAX_AUTHORITATIVE_NATIVE_SIBLINGS + 1;

export function detectAuthoritativeNativeSiblingLimitExceeded(
  loadedAuthoritativeRowCount: number,
): boolean {
  return loadedAuthoritativeRowCount > MAX_AUTHORITATIVE_NATIVE_SIBLINGS;
}

export function buildNativeSiblingLimitExceededEvaluation(): RawRefuelNativeFallbackConvergenceEvaluation {
  return buildEvaluation({
    classification: 'AMBIGUOUS',
    sameNativeEventIds: [],
    distinctNativeEventIds: [],
    insufficientNativeEventIds: [],
    siblingAssessments: [],
    detail: NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL,
    shouldConvergeToNative: false,
    failClosed: true,
  });
}

export function buildPendingPhysicalReconciliationEvaluation(): RawRefuelNativeFallbackConvergenceEvaluation {
  return buildEvaluation({
    classification: 'INSUFFICIENT_EVIDENCE',
    sameNativeEventIds: [],
    distinctNativeEventIds: [],
    insufficientNativeEventIds: [],
    siblingAssessments: [],
    detail: NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL,
    shouldConvergeToNative: false,
    failClosed: false,
  });
}

export function buildPhysicalRefuelAuthorityConflictEvaluation(): RawRefuelNativeFallbackConvergenceEvaluation {
  return buildEvaluation({
    classification: 'AMBIGUOUS',
    sameNativeEventIds: [],
    distinctNativeEventIds: [],
    insufficientNativeEventIds: [],
    siblingAssessments: [],
    detail: PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL,
    shouldConvergeToNative: false,
    failClosed: true,
  });
}

/**
 * F5 authoritative native↔fallback convergence — uses G2 classifyPhysicalRefuelSibling().
 * NOT the F4 advisory aggregate.
 */
export function evaluateRawRefuelNativeFallbackConvergence(
  input: ClassifyRawRefuelNativeOverlapInput,
): RawRefuelNativeFallbackConvergenceEvaluation {
  const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(input.candidate);
  const siblingAssessments: RawRefuelNativeFallbackConvergenceEvaluation['siblingAssessments'] =
    [];
  const sameNativeEventIds: string[] = [];
  const distinctNativeEventIds: string[] = [];
  const insufficientNativeEventIds: string[] = [];

  for (const nativeRow of input.nativeRefuelRows) {
    if (nativeRow.vehicleId !== input.candidate.vehicleId) {
      continue;
    }
    if (!isAuthoritativeNativeRefuelRow(nativeRow)) {
      continue;
    }
    const result = classifyPhysicalRefuelSibling(candidateRow, nativeRow);
    siblingAssessments.push({
      nativeEventId: nativeRow.id,
      classification: result.classification,
      reason: result.reason,
    });
    if (result.classification === 'SAME_PHYSICAL_REFUEL') {
      sameNativeEventIds.push(nativeRow.id);
    } else if (result.classification === 'DISTINCT_PHYSICAL_REFUEL') {
      distinctNativeEventIds.push(nativeRow.id);
    } else {
      insufficientNativeEventIds.push(nativeRow.id);
    }
  }

  return classifyAuthoritativeConvergence({
    sameNativeEventIds,
    distinctNativeEventIds,
    insufficientNativeEventIds,
    siblingAssessments,
  });
}

function isAuthoritativeNativeRefuelRow(row: RefuelRowForMatcher): boolean {
  // Matcher rows carry dimoSegmentId only; persisted source filtering happens at query time.
  return row.kind === 'REFUEL';
}

function classifyAuthoritativeConvergence(input: {
  sameNativeEventIds: string[];
  distinctNativeEventIds: string[];
  insufficientNativeEventIds: string[];
  siblingAssessments: RawRefuelNativeFallbackConvergenceEvaluation['siblingAssessments'];
}): RawRefuelNativeFallbackConvergenceEvaluation {
  const {
    sameNativeEventIds,
    distinctNativeEventIds,
    insufficientNativeEventIds,
    siblingAssessments,
  } = input;

  if (siblingAssessments.length === 0) {
    return buildEvaluation({
      classification: 'NO_NATIVE_SIBLINGS',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail: 'no_authoritative_native_siblings',
      shouldConvergeToNative: false,
      failClosed: false,
    });
  }

  if (sameNativeEventIds.length > 1) {
    return buildEvaluation({
      classification: 'AMBIGUOUS',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail: 'multiple_same_native_siblings',
      shouldConvergeToNative: false,
      failClosed: true,
    });
  }

  if (sameNativeEventIds.length === 1 && insufficientNativeEventIds.length > 0) {
    return buildEvaluation({
      classification: 'INSUFFICIENT_EVIDENCE',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail: 'same_with_insufficient_native_siblings',
      shouldConvergeToNative: false,
      failClosed: true,
    });
  }

  if (sameNativeEventIds.length === 1 && distinctNativeEventIds.length > 0) {
    return buildEvaluation({
      classification: 'AMBIGUOUS',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail: 'same_with_distinct_native_siblings',
      shouldConvergeToNative: false,
      failClosed: true,
    });
  }

  if (sameNativeEventIds.length === 1) {
    return buildEvaluation({
      classification: 'SAME_NATIVE',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail: 'single_authoritative_same_native',
      shouldConvergeToNative: true,
      failClosed: false,
      authoritativeSameNativeEventId: sameNativeEventIds[0],
    });
  }

  if (insufficientNativeEventIds.length > 0) {
    return buildEvaluation({
      classification: 'INSUFFICIENT_EVIDENCE',
      sameNativeEventIds,
      distinctNativeEventIds,
      insufficientNativeEventIds,
      siblingAssessments,
      detail:
        distinctNativeEventIds.length === 0
          ? 'native_neighbors_insufficient_evidence'
          : 'mixed_insufficient_native_neighbors',
      shouldConvergeToNative: false,
      failClosed: true,
    });
  }

  return buildEvaluation({
    classification: 'DISTINCT_FROM_NATIVE',
    sameNativeEventIds,
    distinctNativeEventIds,
    insufficientNativeEventIds,
    siblingAssessments,
    detail: 'all_native_neighbors_distinct',
    shouldConvergeToNative: false,
    failClosed: false,
  });
}

function buildEvaluation(params: {
  classification: RawRefuelNativeFallbackConvergenceEvaluation['classification'];
  sameNativeEventIds: string[];
  distinctNativeEventIds: string[];
  insufficientNativeEventIds: string[];
  siblingAssessments: RawRefuelNativeFallbackConvergenceEvaluation['siblingAssessments'];
  detail: string;
  shouldConvergeToNative: boolean;
  failClosed: boolean;
  authoritativeSameNativeEventId?: string | null;
}): RawRefuelNativeFallbackConvergenceEvaluation {
  return {
    classification: params.classification,
    siblingAssessments: params.siblingAssessments,
    sameNativeEventIds: params.sameNativeEventIds,
    distinctNativeEventIds: params.distinctNativeEventIds,
    insufficientNativeEventIds: params.insufficientNativeEventIds,
    authoritativeSameNativeEventId: params.authoritativeSameNativeEventId ?? null,
    detail: params.detail,
    shouldConvergeToNative: params.shouldConvergeToNative,
    failClosed: params.failClosed,
  };
}

/** Load filter for persisted native REFUEL siblings (excludes fallback source). */
export function buildAuthoritativeNativeRefuelSiblingWhere(
  candidate: RawRefuelCandidate,
  window: { start: Date; end: Date },
) {
  return {
    vehicleId: candidate.vehicleId,
    kind: 'REFUEL' as const,
    OR: [{ detectionSource: null }, { detectionSource: 'DIMO_NATIVE' as const }],
    startTime: { lte: window.end },
    endTime: { gte: window.start },
  };
}

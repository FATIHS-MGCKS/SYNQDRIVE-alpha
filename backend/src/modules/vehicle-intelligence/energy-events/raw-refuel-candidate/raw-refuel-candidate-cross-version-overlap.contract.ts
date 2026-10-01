import type { RawRefuelCandidateLifecycleState } from '@prisma/client';
import { isRawRefuelCandidateTerminal } from './raw-refuel-candidate-lifecycle';
import type { CandidateDetectionVersionCompatibility } from './raw-refuel-candidate-cross-version-compatibility.authority';

/**
 * R2-compatible cross-version overlap vocabulary.
 * Extends semantic matcher tri-state with explicit terminal conflict (not ordinary DISTINCT).
 */
export type RawRefuelCrossVersionOverlapClassification =
  | 'SAME_PHYSICAL_RISE'
  | 'DISTINCT_PHYSICAL_RISE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'VERSIONED_TERMINAL_CONFLICT';

export const NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT = 'INSUFFICIENT_EVIDENCE' as const;

/** R2 invariant: pre plateau compatibility must be explicitly true — null/unknown cannot SAME. */
export function crossVersionPrePlateauQualifiesForSame(
  preCompatible: boolean | null,
): boolean {
  return preCompatible === true;
}

export function mapNullPreCompatibilityForCrossVersion(
  preCompatible: boolean | null,
): typeof NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT | 'PRE_INCOMPATIBLE' {
  if (preCompatible === false) return 'PRE_INCOMPATIBLE';
  if (preCompatible === true) {
    throw new Error('mapNullPreCompatibilityForCrossVersion expects non-true input');
  }
  return NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT;
}

export interface VersionedTerminalConflictInput {
  existingLifecycleState: RawRefuelCandidateLifecycleState;
  versionCompatibility: CandidateDetectionVersionCompatibility;
  /** Future R2: true when temporal/pre neighborhood indicates same physical event. */
  physicalNeighborhoodCorresponds: boolean;
}

/**
 * Pure terminal conflict classifier — R1 contract only (not wired to matcher/service).
 */
export function classifyVersionedTerminalConflict(
  input: VersionedTerminalConflictInput,
): 'VERSIONED_TERMINAL_CONFLICT' | null {
  if (!isRawRefuelCandidateTerminal(input.existingLifecycleState)) {
    return null;
  }
  if (input.versionCompatibility === 'UNAUTHORIZED_VERSION_PAIR') {
    return null;
  }
  if (!input.physicalNeighborhoodCorresponds) {
    return null;
  }
  return 'VERSIONED_TERMINAL_CONFLICT';
}

/** Documented future fail-closed outcomes for VERSIONED_TERMINAL_CONFLICT handling (R2). */
export const VERSIONED_TERMINAL_CONFLICT_FAIL_CLOSED = {
  TERMINAL_ROW_MUTATED: false,
  TERMINAL_ROW_REOPENED: false,
  SECOND_CANDIDATE_INSERTED: false,
} as const;

import type {
  CurrentPhysicalStateProjection,
  PhysicalStateReconcileContext,
  PhysicalStateReconcileResult,
} from './device-connection-physical-state.types';

export type SameStateProofParentSource =
  | 'COORDINATOR_LOCKED_CONTEXT'
  | 'READ_ONLY_EVALUATION_PROJECTION';

/**
 * Parent projection used for same-state admissibility — must match the projection
 * locked inside reconcileInTransaction, not a pre-transaction read.
 */
export function buildSameStateProofParentFromReconcileContext(
  context: PhysicalStateReconcileContext,
): CurrentPhysicalStateProjection | null {
  if (context.previousState == null) return null;
  if (context.previousEvidenceAt == null) return null;
  if (!context.previousEvidenceSource?.trim()) return null;
  if (!context.previousEvidenceReferenceId?.trim()) return null;

  return {
    effectiveState: context.previousState,
    evidenceObservedAt: context.previousEvidenceAt,
    evidenceSource: context.previousEvidenceSource,
    evidenceReferenceId: context.previousEvidenceReferenceId,
    stateVersion: context.stateVersionBefore ?? 0,
  };
}

export function resolveSameStateProofParentFromCoordinatorReconcile(
  reconcile: PhysicalStateReconcileResult,
): { parent: CurrentPhysicalStateProjection | null; source: SameStateProofParentSource } {
  return {
    parent: buildSameStateProofParentFromReconcileContext(reconcile.context),
    source: 'COORDINATOR_LOCKED_CONTEXT',
  };
}

export function resolveSameStateProofParentFromReadOnlyProjection(
  projection: CurrentPhysicalStateProjection | null,
): { parent: CurrentPhysicalStateProjection | null; source: SameStateProofParentSource } {
  return {
    parent: projection,
    source: 'READ_ONLY_EVALUATION_PROJECTION',
  };
}

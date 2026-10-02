import {
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type HvChargeSession,
  type Prisma,
  type VehicleEnergyEvent,
} from '@prisma/client';
import {
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME,
  type ProjectCanonicalRechargeInput,
  type ProjectCanonicalRechargeResult,
} from './erd-canonical-recharge-projector.types';
import { buildErdRechargePhysicalProjectionSourceEventKey } from './erd-recharge-projection-identity.policy';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import {
  buildProjectionHandoffUpdate,
  projectionDraftMatchesPersistedRow,
  readAnchorSegmentFingerprintFromVee,
} from './erd-recharge-projection-reconciliation.policy';
import type { ErdRechargeProjectionIneligibleReason } from './erd-recharge-projection-eligibility.policy';

function isCanonicalErdRechargeProjection(row: VehicleEnergyEvent): boolean {
  return (
    row.kind === EnergyEventKind.RECHARGE &&
    row.detectionSource === VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION &&
    row.sourceEventKey != null &&
    row.sourceEventKey.trim() !== ''
  );
}

export function existingProjectionSourceEventKeyMatchesAnchor(input: {
  existing: VehicleEnergyEvent;
  vehicleId: string;
}): boolean {
  const anchor = readAnchorSegmentFingerprintFromVee(input.existing);
  if (anchor == null) return false;
  const expected = buildErdRechargePhysicalProjectionSourceEventKey({
    vehicleId: input.vehicleId,
    anchorSegmentFingerprint: anchor,
  });
  return input.existing.sourceEventKey === expected;
}

/**
 * E5.3 atomic reassignment of canonicalChargeSessionId on the SAME VEE row while preserving
 * immutable product anchor (sourceEventKey + anchorSegmentFingerprint).
 */
export async function executeLateNativeCanonicalHandoff(input: {
  tx: Prisma.TransactionClient;
  nativeSession: HvChargeSession;
  fallbackSession: HvChargeSession;
  existingProjection: VehicleEnergyEvent;
  projectInput: ProjectCanonicalRechargeInput;
  findByDimoSegmentId: (
    tx: Prisma.TransactionClient,
    dimoSegmentId: string,
  ) => Promise<VehicleEnergyEvent | null>;
  notProjectable: (reason: ErdRechargeProjectionIneligibleReason) => ProjectCanonicalRechargeResult;
}): Promise<ProjectCanonicalRechargeResult> {
  const { tx, nativeSession, fallbackSession, existingProjection, projectInput } = input;
  const existing = existingProjection;

  if (!isCanonicalErdRechargeProjection(existing)) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'existing_row_not_canonical_erd_projection',
      vehicleEnergyEventId: existing.id,
    };
  }

  if (existing.canonicalChargeSessionId !== fallbackSession.id) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'fallback_projection_canonical_session_mismatch',
      vehicleEnergyEventId: existing.id,
    };
  }

  const anchor = readAnchorSegmentFingerprintFromVee(existing);
  if (anchor == null) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'missing_projection_anchor_fingerprint',
      vehicleEnergyEventId: existing.id,
    };
  }

  if (
    !existingProjectionSourceEventKeyMatchesAnchor({
      existing,
      vehicleId: nativeSession.vehicleId,
    })
  ) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'source_event_key_anchor_integrity_failure',
      vehicleEnergyEventId: existing.id,
    };
  }

  const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
    session: nativeSession,
    scope: {
      organizationId: projectInput.organizationId,
      vehicleId: projectInput.vehicleId,
    },
    anchorSegmentFingerprint: anchor,
  });
  if (!mapped.ok) {
    return input.notProjectable(mapped.reason as ErdRechargeProjectionIneligibleReason);
  }

  if (mapped.draft.sourceEventKey !== existing.sourceEventKey) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'handoff_source_event_key_drift',
      vehicleEnergyEventId: existing.id,
    };
  }

  if (mapped.draft.dimoSegmentId != null) {
    const dimoOwner = await input.findByDimoSegmentId(tx, mapped.draft.dimoSegmentId);
    if (dimoOwner != null && dimoOwner.id !== existing.id) {
      return {
        outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.LEGACY_DIMO_COLLISION,
        reason: 'dimo_segment_id_owned_by_existing_row',
        vehicleEnergyEventId: dimoOwner.id,
      };
    }
  }

  if (
    existing.canonicalChargeSessionId === nativeSession.id &&
    projectionDraftMatchesPersistedRow(existing, mapped.draft)
  ) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP,
      vehicleEnergyEventId: existing.id,
      vehicleEnergyEvent: existing,
    };
  }

  const handoffData = buildProjectionHandoffUpdate(mapped.draft, nativeSession.id);

  const updated = await tx.vehicleEnergyEvent.update({
    where: { id: existing.id },
    data: handoffData,
  });

  if (projectInput.injectFailureAfterHandoff) {
    throw new Error('erd_e5_3_injected_failure_after_handoff');
  }

  return {
    outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED,
    vehicleEnergyEventId: updated.id,
    vehicleEnergyEvent: updated,
  };
}

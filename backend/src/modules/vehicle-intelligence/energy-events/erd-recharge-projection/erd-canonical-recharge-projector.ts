import {
  EnergyEventKind,
  Prisma,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
  type HvChargeSession,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { acquireErdHvChargeSessionVehicleAuthorityLock } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/erd-hv-charge-session-authority.lock';
import {
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME,
  type ProjectCanonicalRechargeInput,
  type ProjectCanonicalRechargeResult,
} from './erd-canonical-recharge-projector.types';
import {
  evaluateErdRechargeProjectionEligibility,
  type ErdRechargeProjectionIneligibleReason,
} from './erd-recharge-projection-eligibility.policy';
import { buildErdRechargePhysicalProjectionSourceEventKey } from './erd-recharge-projection-identity.policy';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import {
  buildProjectionReconcileUpdate,
  projectionDraftMatchesPersistedRow,
  readAnchorSegmentFingerprintFromVee,
} from './erd-recharge-projection-reconciliation.policy';

function isCanonicalErdRechargeProjection(row: VehicleEnergyEvent): boolean {
  return (
    row.kind === EnergyEventKind.RECHARGE &&
    row.detectionSource === VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION &&
    row.sourceEventKey != null &&
    row.sourceEventKey.trim() !== ''
  );
}

function mapDraftToCreateData(draft: ReturnType<typeof mapCanonicalHvChargeSessionToErdRechargeProjectionDraft> & {
  ok: true;
}) {
  const d = draft.draft;
  return {
    vehicleId: d.vehicleId,
    kind: d.kind,
    detectionSource: d.detectionSource,
    sourceEventKey: d.sourceEventKey,
    canonicalChargeSessionId: d.canonicalChargeSessionId,
    dimoSegmentId: d.dimoSegmentId,
    detectionMechanism: d.detectionMechanism,
    startTime: d.startTime,
    endTime: d.endTime,
    durationSeconds: d.durationSeconds,
    startLatitude: d.startLatitude,
    startLongitude: d.startLongitude,
    endLatitude: d.endLatitude,
    endLongitude: d.endLongitude,
    fuelDeltaLiters: d.fuelDeltaLiters,
    fuelDeltaPercent: d.fuelDeltaPercent,
    socDeltaPercent: d.socDeltaPercent,
    energyDeltaKwh: d.energyDeltaKwh,
    odometerStartKm: d.odometerStartKm,
    odometerEndKm: d.odometerEndKm,
    confidence: d.confidence,
    rawDetectionMeta: d.rawDetectionMeta as Prisma.InputJsonValue,
    fuelLevelRiseStart: d.fuelLevelRiseStart,
    fuelLevelRiseEnd: d.fuelLevelRiseEnd,
    fuelLevelRiseDurationSeconds: d.fuelLevelRiseDurationSeconds,
  };
}

async function findByCanonicalSessionId(
  tx: Prisma.TransactionClient,
  canonicalChargeSessionId: string,
): Promise<VehicleEnergyEvent | null> {
  return tx.vehicleEnergyEvent.findFirst({
    where: { canonicalChargeSessionId },
  });
}

async function findBySourceEventKey(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  sourceEventKey: string,
): Promise<VehicleEnergyEvent | null> {
  return tx.vehicleEnergyEvent.findFirst({
    where: { vehicleId, sourceEventKey },
  });
}

async function findByDimoSegmentId(
  tx: Prisma.TransactionClient,
  dimoSegmentId: string,
): Promise<VehicleEnergyEvent | null> {
  return tx.vehicleEnergyEvent.findFirst({
    where: { dimoSegmentId },
  });
}

function notProjectable(reason: ErdRechargeProjectionIneligibleReason): ProjectCanonicalRechargeResult {
  return {
    outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE,
    reason,
  };
}

async function reconcileExistingProjection(
  tx: Prisma.TransactionClient,
  session: HvChargeSession,
  existing: VehicleEnergyEvent,
  input: ProjectCanonicalRechargeInput,
): Promise<ProjectCanonicalRechargeResult> {
  if (!isCanonicalErdRechargeProjection(existing)) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'existing_row_not_canonical_erd_projection',
      vehicleEnergyEventId: existing.id,
    };
  }

  if (existing.canonicalChargeSessionId !== session.id) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_REQUIRED,
      reason: 'source_event_key_bound_to_different_canonical_session',
      vehicleEnergyEventId: existing.id,
    };
  }

  const anchor =
    readAnchorSegmentFingerprintFromVee(existing) ?? session.segmentFingerprint;
  const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
    session,
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
    anchorSegmentFingerprint: anchor,
  });
  if (!mapped.ok) {
    return notProjectable(mapped.reason as ErdRechargeProjectionIneligibleReason);
  }

  if (mapped.draft.sourceEventKey !== existing.sourceEventKey) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'source_event_key_drift',
      vehicleEnergyEventId: existing.id,
    };
  }

  if (projectionDraftMatchesPersistedRow(existing, mapped.draft)) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP,
      vehicleEnergyEventId: existing.id,
      vehicleEnergyEvent: existing,
    };
  }

  const updated = await tx.vehicleEnergyEvent.update({
    where: { id: existing.id },
    data: buildProjectionReconcileUpdate(mapped.draft),
  });

  if (input.injectFailureDuringReconcile) {
    throw new Error('erd_e5_2_injected_failure_during_reconcile');
  }

  return {
    outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED,
    vehicleEnergyEventId: updated.id,
    vehicleEnergyEvent: updated,
  };
}

async function projectCanonicalRechargeInTransaction(
  tx: Prisma.TransactionClient,
  input: ProjectCanonicalRechargeInput,
): Promise<ProjectCanonicalRechargeResult> {
  await acquireErdHvChargeSessionVehicleAuthorityLock(tx, input.vehicleId);

  const session = await tx.hvChargeSession.findUnique({
    where: { id: input.chargeSessionId },
  });

  if (session == null) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.AUTHORITY_CONFLICT,
      reason: 'charge_session_not_found',
    };
  }

  if (session.organizationId !== input.organizationId) {
    return notProjectable('organization_mismatch');
  }
  if (session.vehicleId !== input.vehicleId) {
    return notProjectable('vehicle_mismatch');
  }

  const eligibility = evaluateErdRechargeProjectionEligibility({
    session: {
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      source: session.source,
      segmentFingerprint: session.segmentFingerprint,
      idempotencyKey: session.idempotencyKey,
      startAt: session.startAt,
      endAt: session.endAt,
      isOngoing: session.isOngoing,
      metadata: session.metadata,
      qualityStatus:
        session.metadata != null &&
        typeof session.metadata === 'object' &&
        typeof (session.metadata as { qualityStatus?: unknown }).qualityStatus === 'string'
          ? ((session.metadata as { qualityStatus: string }).qualityStatus)
          : null,
    },
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
  });

  if (!eligibility.projectable) {
    return notProjectable(eligibility.reason);
  }

  const mintSourceEventKey = buildErdRechargePhysicalProjectionSourceEventKey({
    vehicleId: session.vehicleId,
    anchorSegmentFingerprint: session.segmentFingerprint,
  });

  const byCanonical = await findByCanonicalSessionId(tx, session.id);
  const bySourceKey = await findBySourceEventKey(tx, session.vehicleId, mintSourceEventKey);

  if (byCanonical && bySourceKey && byCanonical.id !== bySourceKey.id) {
    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      reason: 'canonical_session_and_source_event_key_resolve_different_rows',
      vehicleEnergyEventId: byCanonical.id,
    };
  }

  const existing = byCanonical ?? bySourceKey;

  if (existing != null) {
    if (bySourceKey && bySourceKey.canonicalChargeSessionId !== session.id) {
      return {
        outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_REQUIRED,
        reason: 'source_event_key_bound_to_different_canonical_session',
        vehicleEnergyEventId: bySourceKey.id,
      };
    }
    if (byCanonical && !isCanonicalErdRechargeProjection(byCanonical)) {
      return {
        outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
        reason: 'canonical_charge_session_id_owned_by_non_erd_row',
        vehicleEnergyEventId: byCanonical.id,
      };
    }
    if (
      byCanonical &&
      byCanonical.sourceEventKey != null &&
      byCanonical.sourceEventKey !== mintSourceEventKey &&
      bySourceKey == null
    ) {
      return {
        outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
        reason: 'canonical_session_source_event_key_mismatch',
        vehicleEnergyEventId: byCanonical.id,
      };
    }
    return reconcileExistingProjection(tx, session, existing, input);
  }

  const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
    session,
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
    anchorSegmentFingerprint: session.segmentFingerprint,
  });
  if (!mapped.ok) {
    return notProjectable(mapped.reason as ErdRechargeProjectionIneligibleReason);
  }

  if (mapped.draft.dimoSegmentId != null) {
    const dimoOwner = await findByDimoSegmentId(tx, mapped.draft.dimoSegmentId);
    if (dimoOwner != null) {
      return {
        outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.LEGACY_DIMO_COLLISION,
        reason: 'dimo_segment_id_owned_by_existing_row',
        vehicleEnergyEventId: dimoOwner.id,
      };
    }
  }

  try {
    const created = await tx.vehicleEnergyEvent.create({
      data: mapDraftToCreateData({ ok: true, draft: mapped.draft }),
    });

    if (input.injectFailureAfterCreate) {
      throw new Error('erd_e5_2_injected_failure_after_create');
    }

    return {
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED,
      vehicleEnergyEventId: created.id,
      vehicleEnergyEvent: created,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const racedByKey = await findBySourceEventKey(
        tx,
        session.vehicleId,
        mintSourceEventKey,
      );
      const racedByCanonical = await findByCanonicalSessionId(tx, session.id);
      if (
        racedByKey &&
        racedByCanonical &&
        racedByKey.id !== racedByCanonical.id
      ) {
        return {
          outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
          reason: 'unique_race_identity_split',
        };
      }
      const raced = racedByKey ?? racedByCanonical;
      if (raced) {
        return reconcileExistingProjection(tx, session, raced, input);
      }
    }
    throw error;
  }
}

/**
 * E5.2 canonical HvChargeSession → VehicleEnergyEvent RECHARGE projector.
 * Not registered in Nest; call directly from tests until E5.6 cutover wiring.
 */
export async function projectCanonicalRecharge(
  prisma: PrismaClient,
  input: ProjectCanonicalRechargeInput,
): Promise<ProjectCanonicalRechargeResult> {
  return prisma.$transaction(async (tx) => projectCanonicalRechargeInTransaction(tx, input));
}

/** Same semantics as {@link projectCanonicalRecharge} for callers already inside a transaction. */
export async function projectCanonicalRechargeWithTransaction(
  tx: Prisma.TransactionClient,
  input: ProjectCanonicalRechargeInput,
): Promise<ProjectCanonicalRechargeResult> {
  return projectCanonicalRechargeInTransaction(tx, input);
}

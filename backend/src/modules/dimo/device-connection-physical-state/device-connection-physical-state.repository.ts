import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionPhysicalEffectiveState,
  DeviceConnectionPhysicalTransitionDecision,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPhysicalStateBindingLockKey,
  buildPhysicalStateIdempotencyKey,
  normalizeConnectivityProvider,
} from './device-connection-physical-state.binding';
import {
  evaluatePhysicalStateTransition,
  isAcceptedPhysicalTransition,
} from './device-connection-physical-state.policy';
import type {
  CurrentPhysicalStateProjection,
  PhysicalEvidenceSource,
  PhysicalStateReconcileContext,
  PhysicalStateReconcileInput,
  PhysicalStateReconcileResult,
  PhysicalStateTransitionLogInput,
} from './device-connection-physical-state.types';

const MAX_TRANSACTION_ATTEMPTS = 5;

type PhysicalStateRow = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  provider: string;
  binding_key: string;
  device_binding_id: string | null;
  provider_device_id_hash: string | null;
  effective_state: DeviceConnectionPhysicalEffectiveState;
  evidence_observed_at: Date;
  evidence_source: string;
  evidence_reference_id: string;
  state_version: number;
};

type TransitionAuditRow = {
  id: string;
  decision: DeviceConnectionPhysicalTransitionDecision;
  effective_state: DeviceConnectionPhysicalEffectiveState | null;
};

function mapRow(row: PhysicalStateRow): CurrentPhysicalStateProjection & {
  id: string;
  bindingKey: string;
} {
  return {
    id: row.id,
    bindingKey: row.binding_key,
    effectiveState: row.effective_state,
    evidenceObservedAt: row.evidence_observed_at,
    evidenceSource: row.evidence_source as CurrentPhysicalStateProjection['evidenceSource'],
    evidenceReferenceId: row.evidence_reference_id,
    stateVersion: row.state_version,
  };
}

function buildContext(input: {
  previous: CurrentPhysicalStateProjection | null;
  evidence: PhysicalStateReconcileInput['evidence'];
  resulting: CurrentPhysicalStateProjection | null;
  selfHeal: boolean;
}): PhysicalStateReconcileContext {
  return {
    previousState: input.previous?.effectiveState ?? null,
    candidateState: input.evidence.candidateState,
    resultingState: input.resulting?.effectiveState ?? input.previous?.effectiveState ?? null,
    previousEvidenceAt: input.previous?.evidenceObservedAt ?? null,
    candidateEvidenceAt: input.evidence.evidenceObservedAt,
    incomingEvidenceSource: input.evidence.evidenceSource,
    stateVersionBefore: input.previous?.stateVersion ?? null,
    stateVersionAfter: input.resulting?.stateVersion ?? input.previous?.stateVersion ?? null,
    selfHeal: input.selfHeal,
    evidenceReferenceId: input.evidence.evidenceReferenceId,
  };
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    return code === '40001' || code === '40P01';
  }
  return false;
}

@Injectable()
export class DeviceConnectionPhysicalStateRepository {
  private readonly logger = new Logger(DeviceConnectionPhysicalStateRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileEvidence(
    input: PhysicalStateReconcileInput,
  ): Promise<PhysicalStateReconcileResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => this.reconcileInTransaction(tx, input));
      } catch (error) {
        if (isSerializationFailure(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          this.logger.warn(
            `physical_state_reconcile serialization retry attempt=${attempt} vehicle=${input.vehicleId}`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new Error('physical_state_reconcile exhausted transaction retries');
  }

  private async reconcileInTransaction(
    tx: Prisma.TransactionClient,
    input: PhysicalStateReconcileInput,
  ): Promise<PhysicalStateReconcileResult> {
    const provider = normalizeConnectivityProvider(input.binding.provider);
    const bindingKey = input.binding.bindingKey;
    const selfHeal = input.selfHeal === true;

    await this.assertVehicleTenantScope(tx, input.organizationId, input.vehicleId);

    const lockKey = buildPhysicalStateBindingLockKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider,
      bindingKey,
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const lockedRows = await tx.$queryRaw<PhysicalStateRow[]>`
      SELECT *
      FROM device_connection_physical_states
      WHERE organization_id = ${input.organizationId}::uuid
        AND vehicle_id = ${input.vehicleId}::uuid
        AND provider = ${provider}
        AND binding_key = ${bindingKey}
      FOR UPDATE
    `;

    const currentRow = lockedRows[0] ?? null;
    const current = currentRow ? mapRow(currentRow) : null;

    const evaluation = evaluatePhysicalStateTransition({
      current,
      incoming: input.evidence,
    });

    const auditResult = await this.appendTransitionAudit(tx, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider,
      bindingKey,
      previousState: current?.effectiveState ?? null,
      effectiveState: evaluation.nextState,
      evidence: input.evidence,
      parentStateVersion: current?.stateVersion ?? null,
      appliedStateVersion: null,
      decision: evaluation.decision,
      metadataJson: evaluation.reason ? { reason: evaluation.reason } : undefined,
    });

    if (auditResult.conflictingCandidate) {
      const context = buildContext({
        previous: current,
        evidence: input.evidence,
        resulting: current,
        selfHeal,
      });
      return {
        enabled: true,
        decision: DeviceConnectionPhysicalTransitionDecision.CONFLICT,
        projection: current
          ? {
              effectiveState: current.effectiveState,
              evidenceObservedAt: current.evidenceObservedAt,
              evidenceSource: current.evidenceSource,
              evidenceReferenceId: current.evidenceReferenceId,
              stateVersion: current.stateVersion,
            }
          : null,
        transitionId: auditResult.transitionId,
        episodeAction: 'none',
        alertAction: 'none',
        context,
        reason: 'idempotency_key_candidate_state_conflict',
      };
    }

    if (!evaluation.mutateProjection) {
      const context = buildContext({
        previous: current,
        evidence: input.evidence,
        resulting: current,
        selfHeal,
      });
      return {
        enabled: true,
        decision: auditResult.duplicate ? DeviceConnectionPhysicalTransitionDecision.DUPLICATE : evaluation.decision,
        projection: current
          ? {
              effectiveState: current.effectiveState,
              evidenceObservedAt: current.evidenceObservedAt,
              evidenceSource: current.evidenceSource,
              evidenceReferenceId: current.evidenceReferenceId,
              stateVersion: current.stateVersion,
            }
          : null,
        transitionId: auditResult.transitionId,
        episodeAction: 'none',
        alertAction: 'none',
        context,
        reason: evaluation.reason,
      };
    }

    const nextVersion =
      evaluation.decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED
        ? 1
        : (current?.stateVersion ?? 0) + 1;

    let projection: CurrentPhysicalStateProjection;

    if (!currentRow) {
      const inserted = await this.insertProjectionOnConflictDoNothing(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        bindingKey,
        deviceBindingId: input.binding.deviceBindingId,
        providerDeviceIdHash: input.binding.providerDeviceIdHash,
        effectiveState: evaluation.nextState!,
        evidenceObservedAt: input.evidence.evidenceObservedAt,
        evidenceSource: input.evidence.evidenceSource,
        evidenceReferenceId: input.evidence.evidenceReferenceId,
        stateVersion: nextVersion,
      });

      if (!inserted) {
        const retryRows = await tx.$queryRaw<PhysicalStateRow[]>`
          SELECT *
          FROM device_connection_physical_states
          WHERE organization_id = ${input.organizationId}::uuid
            AND vehicle_id = ${input.vehicleId}::uuid
            AND provider = ${provider}
            AND binding_key = ${bindingKey}
          FOR UPDATE
        `;
        const winner = retryRows[0];
        if (!winner) {
          throw new Error('physical_state_projection_insert_race_without_row');
        }
        const winnerProjection = mapRow(winner);
        const retryEval = evaluatePhysicalStateTransition({
          current: winnerProjection,
          incoming: input.evidence,
        });
        const context = buildContext({
          previous: winnerProjection,
          evidence: input.evidence,
          resulting: winnerProjection,
          selfHeal,
        });
        return {
          enabled: true,
          decision: retryEval.decision,
          projection: {
            effectiveState: winnerProjection.effectiveState,
            evidenceObservedAt: winnerProjection.evidenceObservedAt,
            evidenceSource: winnerProjection.evidenceSource,
            evidenceReferenceId: winnerProjection.evidenceReferenceId,
            stateVersion: winnerProjection.stateVersion,
          },
          transitionId: auditResult.transitionId,
          episodeAction: 'none',
          alertAction: 'none',
          context,
          reason: retryEval.reason ?? 'projection_insert_race_re_evaluated',
        };
      }
      projection = inserted;
    } else {
      const updated = await tx.deviceConnectionPhysicalState.update({
        where: { id: currentRow.id },
        data: {
          effectiveState: evaluation.nextState!,
          evidenceObservedAt: input.evidence.evidenceObservedAt,
          evidenceSource: input.evidence.evidenceSource,
          evidenceReferenceId: input.evidence.evidenceReferenceId,
          stateVersion: nextVersion,
          deviceBindingId: input.binding.deviceBindingId ?? currentRow.device_binding_id,
          providerDeviceIdHash: input.binding.providerDeviceIdHash,
        },
      });
      projection = {
        effectiveState: updated.effectiveState,
        evidenceObservedAt: updated.evidenceObservedAt,
        evidenceSource: updated.evidenceSource,
        evidenceReferenceId: updated.evidenceReferenceId,
        stateVersion: updated.stateVersion,
      };
    }

    if (auditResult.transitionId && isAcceptedPhysicalTransition(evaluation.decision)) {
      await tx.deviceConnectionPhysicalStateTransition.update({
        where: { id: auditResult.transitionId },
        data: { appliedStateVersion: projection.stateVersion },
      });
    }

    const logicalChange =
      evaluation.decision === DeviceConnectionPhysicalTransitionDecision.APPLIED &&
      current != null &&
      current.effectiveState !== evaluation.nextState;

    const episodeAction = this.resolveEpisodeAction({
      logicalChange,
      selfHeal,
      evidenceSource: input.evidence.evidenceSource,
      previousState: current?.effectiveState ?? null,
      nextState: evaluation.nextState,
    });

    const context = buildContext({
      previous: current,
      evidence: input.evidence,
      resulting: projection,
      selfHeal,
    });

    return {
      enabled: true,
      decision: evaluation.decision,
      projection,
      transitionId: auditResult.transitionId,
      episodeAction,
      alertAction: this.resolveAlertAction(episodeAction),
      context,
      reason: evaluation.reason,
    };
  }

  private async assertVehicleTenantScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle || vehicle.organizationId !== organizationId) {
      throw new Error(
        `physical_state_vehicle_tenant_mismatch vehicle=${vehicleId} org=${organizationId}`,
      );
    }
  }

  private async insertProjectionOnConflictDoNothing(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      vehicleId: string;
      provider: string;
      bindingKey: string;
      deviceBindingId: string | null;
      providerDeviceIdHash: string;
      effectiveState: DeviceConnectionPhysicalEffectiveState;
      evidenceObservedAt: Date;
      evidenceSource: PhysicalEvidenceSource;
      evidenceReferenceId: string;
      stateVersion: number;
    },
  ): Promise<CurrentPhysicalStateProjection | null> {
    const rows = await tx.$queryRaw<PhysicalStateRow[]>`
      INSERT INTO device_connection_physical_states (
        id,
        organization_id,
        vehicle_id,
        provider,
        binding_key,
        device_binding_id,
        provider_device_id_hash,
        effective_state,
        evidence_observed_at,
        evidence_source,
        evidence_reference_id,
        state_version,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        ${input.organizationId}::uuid,
        ${input.vehicleId}::uuid,
        ${input.provider},
        ${input.bindingKey},
        ${input.deviceBindingId},
        ${input.providerDeviceIdHash},
        ${input.effectiveState}::"DeviceConnectionPhysicalEffectiveState",
        ${input.evidenceObservedAt},
        ${input.evidenceSource}::"DeviceConnectionPhysicalEvidenceSource",
        ${input.evidenceReferenceId},
        ${input.stateVersion},
        NOW(),
        NOW()
      )
      ON CONFLICT (organization_id, vehicle_id, provider, binding_key) DO NOTHING
      RETURNING *
    `;

    const row = rows[0];
    if (!row) return null;
    const mapped = mapRow(row);
    return {
      effectiveState: mapped.effectiveState,
      evidenceObservedAt: mapped.evidenceObservedAt,
      evidenceSource: mapped.evidenceSource,
      evidenceReferenceId: mapped.evidenceReferenceId,
      stateVersion: mapped.stateVersion,
    };
  }

  private resolveEpisodeAction(input: {
    logicalChange: boolean;
    selfHeal: boolean;
    evidenceSource: PhysicalEvidenceSource;
    previousState: DeviceConnectionPhysicalEffectiveState | null;
    nextState: DeviceConnectionPhysicalEffectiveState | null;
  }): PhysicalStateReconcileResult['episodeAction'] {
    if (!input.logicalChange || input.selfHeal) return 'none';
    if (
      input.nextState === DeviceConnectionPhysicalEffectiveState.UNPLUGGED &&
      input.evidenceSource === 'SNAPSHOT_OBD'
    ) {
      return 'none';
    }
    if (input.nextState === DeviceConnectionPhysicalEffectiveState.UNPLUGGED) {
      return 'open_unplug';
    }
    if (input.nextState === DeviceConnectionPhysicalEffectiveState.PLUGGED) {
      return 'resolve_plug';
    }
    return 'none';
  }

  private resolveAlertAction(
    episodeAction: PhysicalStateReconcileResult['episodeAction'],
  ): PhysicalStateReconcileResult['alertAction'] {
    if (episodeAction === 'open_unplug') return 'emit_unplug';
    if (episodeAction === 'resolve_plug') return 'resolve_unplug';
    return 'none';
  }

  private async appendTransitionAudit(
    tx: Prisma.TransactionClient,
    input: PhysicalStateTransitionLogInput,
  ): Promise<{ transitionId: string | null; duplicate: boolean; conflictingCandidate: boolean }> {
    const idempotencyKey = buildPhysicalStateIdempotencyKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      bindingKey: input.bindingKey,
      evidenceSource: input.evidence.evidenceSource,
      evidenceReferenceId: input.evidence.evidenceReferenceId,
      evidenceObservedAt: input.evidence.evidenceObservedAt,
      candidateState: input.evidence.candidateState,
    });

    const inserted = await tx.$queryRaw<TransitionAuditRow[]>`
      INSERT INTO device_connection_physical_state_transitions (
        id,
        organization_id,
        vehicle_id,
        provider,
        binding_key,
        previous_state,
        effective_state,
        evidence_observed_at,
        evidence_source,
        evidence_reference_id,
        parent_state_version,
        applied_state_version,
        decision,
        idempotency_key,
        metadata_json,
        created_at
      ) VALUES (
        gen_random_uuid(),
        ${input.organizationId}::uuid,
        ${input.vehicleId}::uuid,
        ${input.provider},
        ${input.bindingKey},
        ${input.previousState}::"DeviceConnectionPhysicalEffectiveState",
        ${input.effectiveState}::"DeviceConnectionPhysicalEffectiveState",
        ${input.evidence.evidenceObservedAt},
        ${input.evidence.evidenceSource}::"DeviceConnectionPhysicalEvidenceSource",
        ${input.evidence.evidenceReferenceId},
        ${input.parentStateVersion},
        ${input.appliedStateVersion},
        ${input.decision}::"DeviceConnectionPhysicalTransitionDecision",
        ${idempotencyKey},
        ${(input.metadataJson ?? null) as Prisma.InputJsonValue},
        NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, decision, effective_state
    `;

    if (inserted[0]) {
      return { transitionId: inserted[0].id, duplicate: false, conflictingCandidate: false };
    }

    const existing = await tx.$queryRaw<TransitionAuditRow[]>`
      SELECT id, decision, effective_state
      FROM device_connection_physical_state_transitions
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;

    const row = existing[0];
    if (!row) {
      return { transitionId: null, duplicate: true, conflictingCandidate: false };
    }

    const conflictingCandidate =
      row.effective_state != null &&
      input.evidence.candidateState !== row.effective_state;

    return {
      transitionId: row.id,
      duplicate: !conflictingCandidate,
      conflictingCandidate,
    };
  }
}

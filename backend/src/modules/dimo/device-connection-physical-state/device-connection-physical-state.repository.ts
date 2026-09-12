import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionPhysicalEffectiveState,
  DeviceConnectionPhysicalTransitionDecision,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPhysicalStateIdempotencyKey } from './device-connection-physical-state.binding';
import {
  evaluatePhysicalStateTransition,
  isAcceptedPhysicalTransition,
} from './device-connection-physical-state.policy';
import type {
  CurrentPhysicalStateProjection,
  PhysicalEvidenceSource,
  PhysicalStateReconcileInput,
  PhysicalStateReconcileResult,
  PhysicalStateTransitionLogInput,
} from './device-connection-physical-state.types';

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

@Injectable()
export class DeviceConnectionPhysicalStateRepository {
  private readonly logger = new Logger(DeviceConnectionPhysicalStateRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileEvidence(
    input: PhysicalStateReconcileInput,
  ): Promise<PhysicalStateReconcileResult> {
    return this.reconcileInTransaction(input);
  }

  async reconcileInTransaction(
    input: PhysicalStateReconcileInput,
  ): Promise<PhysicalStateReconcileResult> {
    const provider = input.binding.provider;
    const bindingKey = input.binding.bindingKey;

    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<PhysicalStateRow[]>`
        SELECT *
        FROM device_connection_physical_states
        WHERE organization_id = ${input.organizationId}
          AND vehicle_id = ${input.vehicleId}
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

      const transitionId = await this.appendTransitionAudit(tx, {
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

      if (!evaluation.mutateProjection) {
        return {
          enabled: true,
          decision: evaluation.decision,
          projection: current
            ? {
                effectiveState: current.effectiveState,
                evidenceObservedAt: current.evidenceObservedAt,
                evidenceSource: current.evidenceSource,
                evidenceReferenceId: current.evidenceReferenceId,
                stateVersion: current.stateVersion,
              }
            : null,
          transitionId,
          episodeAction: 'none',
          alertAction: 'none',
          reason: evaluation.reason,
        };
      }

      const nextVersion =
        evaluation.decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED
          ? 1
          : (current?.stateVersion ?? 0) + 1;

      let projection: CurrentPhysicalStateProjection;

      if (!currentRow) {
        try {
          const created = await tx.deviceConnectionPhysicalState.create({
            data: {
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
            },
          });
          projection = {
            effectiveState: created.effectiveState,
            evidenceObservedAt: created.evidenceObservedAt,
            evidenceSource: created.evidenceSource,
            evidenceReferenceId: created.evidenceReferenceId,
            stateVersion: created.stateVersion,
          };
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            const retryRows = await tx.$queryRaw<PhysicalStateRow[]>`
              SELECT *
              FROM device_connection_physical_states
              WHERE organization_id = ${input.organizationId}
                AND vehicle_id = ${input.vehicleId}
                AND provider = ${provider}
                AND binding_key = ${bindingKey}
              FOR UPDATE
            `;
            const retryCurrent = retryRows[0] ? mapRow(retryRows[0]) : null;
            const retryEval = evaluatePhysicalStateTransition({
              current: retryCurrent,
              incoming: input.evidence,
            });
            return {
              enabled: true,
              decision: retryEval.decision,
              projection: retryCurrent
                ? {
                    effectiveState: retryCurrent.effectiveState,
                    evidenceObservedAt: retryCurrent.evidenceObservedAt,
                    evidenceSource: retryCurrent.evidenceSource,
                    evidenceReferenceId: retryCurrent.evidenceReferenceId,
                    stateVersion: retryCurrent.stateVersion,
                  }
                : null,
              transitionId,
              episodeAction: 'none',
              alertAction: 'none',
              reason: retryEval.reason ?? 'binding_create_race',
            };
          }
          throw error;
        }
      } else {
        const updated = await tx.deviceConnectionPhysicalState.update({
          where: { id: currentRow.id },
          data: {
            effectiveState: evaluation.nextState!,
            evidenceObservedAt: input.evidence.evidenceObservedAt,
            evidenceSource: input.evidence.evidenceSource,
            evidenceReferenceId: input.evidence.evidenceReferenceId,
            stateVersion: nextVersion,
            deviceBindingId: input.binding.deviceBindingId,
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

      if (transitionId && isAcceptedPhysicalTransition(evaluation.decision)) {
        await tx.deviceConnectionPhysicalStateTransition.update({
          where: { id: transitionId },
          data: { appliedStateVersion: projection.stateVersion },
        });
      }

      const logicalChange =
        !current ||
        (current.effectiveState !== evaluation.nextState &&
          (evaluation.decision === DeviceConnectionPhysicalTransitionDecision.APPLIED ||
            evaluation.decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED));

      const episodeAction = this.resolveEpisodeAction({
        logicalChange,
        selfHeal: input.selfHeal === true,
        evidenceSource: input.evidence.evidenceSource,
        previousState: current?.effectiveState ?? null,
        nextState: evaluation.nextState,
      });

      const alertAction = this.resolveAlertAction(episodeAction);

      return {
        enabled: true,
        decision: evaluation.decision,
        projection,
        transitionId,
        episodeAction,
        alertAction,
        reason: evaluation.reason,
      };
    });
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
  ): Promise<string | null> {
    const idempotencyKey = buildPhysicalStateIdempotencyKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      bindingKey: input.bindingKey,
      evidenceSource: input.evidence.evidenceSource,
      evidenceReferenceId: input.evidence.evidenceReferenceId,
      evidenceObservedAt: input.evidence.evidenceObservedAt,
    });

    try {
      const row = await tx.deviceConnectionPhysicalStateTransition.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider: input.provider,
          bindingKey: input.bindingKey,
          previousState: input.previousState,
          effectiveState: input.effectiveState,
          evidenceObservedAt: input.evidence.evidenceObservedAt,
          evidenceSource: input.evidence.evidenceSource,
          evidenceReferenceId: input.evidence.evidenceReferenceId,
          parentStateVersion: input.parentStateVersion,
          appliedStateVersion: input.appliedStateVersion,
          decision: input.decision,
          idempotencyKey,
          metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await tx.deviceConnectionPhysicalStateTransition.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        return existing?.id ?? null;
      }
      throw error;
    }
  }
}

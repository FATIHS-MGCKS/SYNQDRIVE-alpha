import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeConnectivityProvider } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import type {
  PhysicalStateCoordinatorInput,
  PhysicalStateCoordinatorPreCutoverBlockedResult,
  PhysicalStateCoordinatorReconciledResult,
  PhysicalStateCoordinatorResult,
  PhysicalStateCoordinatorTestSeam,
  PhysicalStateReconcileResult,
} from './device-connection-physical-state.types';

const MAX_TRANSACTION_ATTEMPTS = 5;

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

function dedupBucket(observedAt: Date): bigint {
  return BigInt(Math.floor(observedAt.getTime() / 1000));
}

function shouldUpsertWebhookEventHistory(
  reconcile: PhysicalStateReconcileResult,
  input: PhysicalStateCoordinatorInput,
): boolean {
  if (!input.webhookEventUpsert) return false;
  if (reconcile.decision !== DeviceConnectionPhysicalTransitionDecision.APPLIED) return false;
  return reconcile.context.incomingEvidenceSource === DeviceConnectionPhysicalEvidenceSource.WEBHOOK;
}

function shouldEnqueueActionOutbox(
  reconcile: PhysicalStateReconcileResult,
  sideEffectsEnabled: boolean,
): boolean {
  if (!sideEffectsEnabled) return false;
  return reconcile.episodeAction !== 'none' || reconcile.alertAction !== 'none';
}

@Injectable()
export class PhysicalStateReconcileCoordinator {
  private readonly logger = new Logger(PhysicalStateReconcileCoordinator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly physicalStateRepository: DeviceConnectionPhysicalStateRepository,
    private readonly actionOutboxRepository: DeviceConnectionPhysicalStateActionOutboxRepository,
    private readonly authorityCutoverRepository: DeviceConnectionPhysicalAuthorityCutoverRepository,
  ) {}

  async reconcileInOuterTransaction(
    input: PhysicalStateCoordinatorInput,
    options?: {
      testSeam?: PhysicalStateCoordinatorTestSeam;
      sideEffectsEnabled?: boolean;
      requireLegacyAuthorityForPreseed?: boolean;
    },
  ): Promise<PhysicalStateCoordinatorResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.reconcileInOuterTransactionTx(tx, input, {
            testSeam: options?.testSeam,
            sideEffectsEnabled: options?.sideEffectsEnabled ?? false,
            requireLegacyAuthorityForPreseed: options?.requireLegacyAuthorityForPreseed ?? false,
          }),
        );
      } catch (error) {
        if (isSerializationFailure(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          this.logger.warn(
            `physical_state_coordinator serialization retry attempt=${attempt} vehicle=${input.reconcile.vehicleId}`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new Error('physical_state_coordinator exhausted transaction retries');
  }

  private async reconcileInOuterTransactionTx(
    tx: Prisma.TransactionClient,
    input: PhysicalStateCoordinatorInput,
    options: {
      testSeam?: PhysicalStateCoordinatorTestSeam;
      sideEffectsEnabled: boolean;
      requireLegacyAuthorityForPreseed: boolean;
    },
  ): Promise<PhysicalStateCoordinatorResult> {
    const { testSeam, sideEffectsEnabled, requireLegacyAuthorityForPreseed } = options;

    if (requireLegacyAuthorityForPreseed) {
      const provider = normalizeConnectivityProvider(input.reconcile.binding.provider);
      const authorityMode = await this.authorityCutoverRepository.lockAuthorityScopeAndReadMode(
        tx,
        {
          organizationId: input.reconcile.organizationId,
          vehicleId: input.reconcile.vehicleId,
          provider,
        },
      );

      if (authorityMode !== DeviceConnectionPhysicalAuthorityMode.LEGACY) {
        return this.buildPreCutoverAuthorityBlockedResult(authorityMode);
      }
    }

    const reconcile = await this.physicalStateRepository.reconcileInTransaction(
      tx,
      input.reconcile,
    );

    if (testSeam?.afterReconcile) {
      await testSeam.afterReconcile();
    }

    let canonicalEventId: string | null = input.reconcile.canonicalEventId ?? null;

    if (shouldUpsertWebhookEventHistory(reconcile, input) && input.webhookEventUpsert) {
      canonicalEventId = await this.upsertWebhookEventHistory(tx, input.webhookEventUpsert);
      if (testSeam?.afterWebhookEventUpsert) {
        await testSeam.afterWebhookEventUpsert();
      }
    }

    let outboxId: string | null = null;
    let outboxDuplicate = false;

    if (
      shouldEnqueueActionOutbox(reconcile, sideEffectsEnabled) &&
      reconcile.transitionId &&
      reconcile.projection
    ) {
      const provider = normalizeConnectivityProvider(input.reconcile.binding.provider);
      const enqueue = await this.actionOutboxRepository.enqueueInTransaction(tx, {
        organizationId: input.reconcile.organizationId,
        vehicleId: input.reconcile.vehicleId,
        provider,
        bindingKey: input.reconcile.binding.bindingKey,
        transitionId: reconcile.transitionId,
        stateVersion: reconcile.projection.stateVersion,
        evidenceReferenceId: reconcile.context.evidenceReferenceId,
        canonicalEventId,
        episodeAction: reconcile.episodeAction,
        alertAction: reconcile.alertAction,
      });
      outboxId = enqueue.outboxId;
      outboxDuplicate = enqueue.duplicate;

      if (testSeam?.afterOutboxEnqueue) {
        await testSeam.afterOutboxEnqueue();
      }
    }

    return {
      kind: 'reconciled',
      reconcile,
      canonicalEventId,
      outboxId,
      outboxDuplicate,
    };
  }

  private buildPreCutoverAuthorityBlockedResult(
    authorityMode: DeviceConnectionPhysicalAuthorityMode,
  ): PhysicalStateCoordinatorPreCutoverBlockedResult {
    return {
      kind: 'pre_cutover_authority_blocked',
      reason: 'SKIP_NON_LEGACY_AUTHORITY',
      authorityMode,
    };
  }

  private async upsertWebhookEventHistory(
    tx: Prisma.TransactionClient,
    input: PhysicalStateCoordinatorInput['webhookEventUpsert'] & object,
  ): Promise<string> {
    const provider = normalizeConnectivityProvider(input.provider);
    const eventType = input.eventType;
    const receivedAt = input.receivedAt ?? new Date();
    const dedupBucket = dedupBucketFromObservedAt(input.observedAt);

    const row = await tx.dimoDeviceConnectionEvent.upsert({
      where: {
        provider_vehicleId_eventType_dedupBucket: {
          provider,
          vehicleId: input.vehicleId,
          eventType,
          dedupBucket,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        provider,
        eventType,
        observedAt: input.observedAt,
        receivedAt,
        dedupBucket,
        rawPayloadJson: input.rawPayloadJson as Prisma.InputJsonValue,
      },
      update: {},
      select: { id: true },
    });

    return row.id;
  }
}

function dedupBucketFromObservedAt(observedAt: Date): bigint {
  return dedupBucket(observedAt);
}

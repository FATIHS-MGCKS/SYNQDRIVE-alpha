import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionPhysicalStateActionOutboxStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPhysicalStateActionOutboxIdempotencyKey } from './device-connection-physical-state.binding';
import type {
  PhysicalStateAlertAction,
  PhysicalStateEpisodeAction,
} from './device-connection-physical-state.types';

const CLAIMABLE_STATUSES: DeviceConnectionPhysicalStateActionOutboxStatus[] = [
  DeviceConnectionPhysicalStateActionOutboxStatus.PENDING,
  DeviceConnectionPhysicalStateActionOutboxStatus.RETRYABLE_FAILED,
];

export type PhysicalStateActionOutboxEnqueueInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  bindingKey: string;
  transitionId: string;
  stateVersion: number;
  evidenceReferenceId: string;
  canonicalEventId?: string | null;
  episodeAction: PhysicalStateEpisodeAction;
  alertAction: PhysicalStateAlertAction;
};

type OutboxRow = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  provider: string;
  binding_key: string;
  transition_id: string;
  state_version: number;
  evidence_reference_id: string;
  canonical_event_id: string | null;
  episode_action: string;
  alert_action: string;
  idempotency_key: string;
  status: DeviceConnectionPhysicalStateActionOutboxStatus;
  processing_attempts: number;
  processing_lease_expires_at: Date | null;
  next_retry_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
  dead_lettered_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapOutboxRow(row: OutboxRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    provider: row.provider,
    bindingKey: row.binding_key,
    transitionId: row.transition_id,
    stateVersion: row.state_version,
    evidenceReferenceId: row.evidence_reference_id,
    canonicalEventId: row.canonical_event_id,
    episodeAction: row.episode_action,
    alertAction: row.alert_action,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    processingAttempts: row.processing_attempts,
    processingLeaseExpiresAt: row.processing_lease_expires_at,
    nextRetryAt: row.next_retry_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    deadLetteredAt: row.dead_lettered_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class DeviceConnectionPhysicalStateActionOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  buildIdempotencyKey(input: PhysicalStateActionOutboxEnqueueInput): string {
    return buildPhysicalStateActionOutboxIdempotencyKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      bindingKey: input.bindingKey,
      stateVersion: input.stateVersion,
      episodeAction: input.episodeAction,
      alertAction: input.alertAction,
    });
  }

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: PhysicalStateActionOutboxEnqueueInput,
  ): Promise<{ outboxId: string | null; duplicate: boolean }> {
    const idempotencyKey = this.buildIdempotencyKey(input);
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO device_connection_physical_state_action_outbox (
        id,
        organization_id,
        vehicle_id,
        provider,
        binding_key,
        transition_id,
        state_version,
        evidence_reference_id,
        canonical_event_id,
        episode_action,
        alert_action,
        idempotency_key,
        status,
        processing_attempts,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        ${input.organizationId},
        ${input.vehicleId},
        ${input.provider},
        ${input.bindingKey},
        ${input.transitionId},
        ${input.stateVersion},
        ${input.evidenceReferenceId},
        ${input.canonicalEventId ?? null},
        ${input.episodeAction},
        ${input.alertAction},
        ${idempotencyKey},
        ${DeviceConnectionPhysicalStateActionOutboxStatus.PENDING}::"DeviceConnectionPhysicalStateActionOutboxStatus",
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `;

    if (inserted[0]) {
      return { outboxId: inserted[0].id, duplicate: false };
    }

    const existing = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM device_connection_physical_state_action_outbox
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    return { outboxId: existing[0]?.id ?? null, duplicate: true };
  }

  findById(id: string) {
    return this.prisma.deviceConnectionPhysicalStateActionOutbox.findUnique({ where: { id } });
  }

  async claimBatchWithSkipLocked(
    limit: number,
    now: Date,
    leaseExpiresAt: Date,
  ) {
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE device_connection_physical_state_action_outbox AS o
      SET
        status = ${DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING}::"DeviceConnectionPhysicalStateActionOutboxStatus",
        processing_attempts = o.processing_attempts + 1,
        processing_lease_expires_at = ${leaseExpiresAt},
        updated_at = NOW()
      WHERE o.id IN (
        SELECT id
        FROM device_connection_physical_state_action_outbox
        WHERE status::text = ANY(ARRAY[${Prisma.join(CLAIMABLE_STATUSES)}]::text[])
          AND (next_retry_at IS NULL OR next_retry_at <= ${now})
          AND (
            processing_lease_expires_at IS NULL
            OR processing_lease_expires_at <= ${now}
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING o.*
    `;
    return rows.map(mapOutboxRow);
  }

  async claimForProcessing(id: string, now: Date, leaseExpiresAt: Date) {
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE device_connection_physical_state_action_outbox AS o
      SET
        status = ${DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING}::"DeviceConnectionPhysicalStateActionOutboxStatus",
        processing_attempts = o.processing_attempts + 1,
        processing_lease_expires_at = ${leaseExpiresAt},
        updated_at = NOW()
      WHERE o.id = ${id}
        AND status::text = ANY(ARRAY[${Prisma.join(CLAIMABLE_STATUSES)}]::text[])
        AND (next_retry_at IS NULL OR next_retry_at <= ${now})
        AND (
          processing_lease_expires_at IS NULL
          OR processing_lease_expires_at <= ${now}
        )
      RETURNING o.*
    `;
    const row = rows[0];
    return row ? mapOutboxRow(row) : null;
  }

  async markCompleted(id: string) {
    return this.prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.COMPLETED,
        completedAt: new Date(),
        processingLeaseExpiresAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  async markRetryableFailed(
    id: string,
    input: { errorCode: string; errorMessage: string; nextRetryAt: Date },
  ) {
    return this.prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.RETRYABLE_FAILED,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        nextRetryAt: input.nextRetryAt,
        processingLeaseExpiresAt: null,
      },
    });
  }

  async markDeadLetter(id: string, input: { errorCode: string; errorMessage: string }) {
    const deadLetteredAt = new Date();
    return this.prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.DEAD_LETTER,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        deadLetteredAt,
        nextRetryAt: null,
        processingLeaseExpiresAt: null,
      },
    });
  }

  async releaseExpiredLease(id: string, nextRetryAt: Date) {
    const result = await this.prisma.deviceConnectionPhysicalStateActionOutbox.updateMany({
      where: {
        id,
        status: DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING,
      },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.RETRYABLE_FAILED,
        lastErrorCode: 'processing_lease_expired',
        lastErrorMessage: 'processing lease expired before ack',
        nextRetryAt,
        processingLeaseExpiresAt: null,
      },
    });
    return result.count > 0;
  }

  findStaleProcessingBatch(staleBefore: Date, limit: number) {
    return this.prisma.deviceConnectionPhysicalStateActionOutbox.findMany({
      where: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING,
        processingLeaseExpiresAt: { lt: staleBefore },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }
}

export function computePhysicalStateActionOutboxBackoffMs(
  baseBackoffMs: number,
  attempt: number,
): number {
  return baseBackoffMs * 2 ** Math.max(0, attempt - 1);
}

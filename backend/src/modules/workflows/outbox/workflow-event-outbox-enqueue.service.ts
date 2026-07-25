import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowEventOutboxStatus } from '@prisma/client';
import { createWorkflowDomainEventEnvelope } from '../envelope';
import { envelopeToOutboxCreateData } from './workflow-event-outbox.mapper';
import {
  buildWorkflowOutboxIdempotencyKey,
  truncateOutboxErrorSummary,
} from './workflow-event-outbox.constants';
import type {
  WorkflowEventOutboxEnqueueInput,
  WorkflowEventOutboxRecord,
} from './workflow-event-outbox.types';
import { WorkflowEventOutboxEnqueueError } from './workflow-event-outbox.types';

@Injectable()
export class WorkflowEventOutboxEnqueueService {
  /**
   * Atomically enqueue a validated workflow domain event inside an existing transaction.
   * Rolls back the caller transaction when envelope validation fails.
   */
  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: WorkflowEventOutboxEnqueueInput,
  ): Promise<WorkflowEventOutboxRecord> {
    if (!input.organizationId?.trim()) {
      throw new WorkflowEventOutboxEnqueueError(
        'organizationId is required',
        'MISSING_ORGANIZATION_ID',
        'organizationId',
      );
    }

    const idempotencyKey =
      input.idempotencyKey?.trim()
      ?? buildWorkflowOutboxIdempotencyKey([
        input.eventType,
        input.entityId ?? input.payload?.bookingId?.toString() ?? input.payload?.invoiceId?.toString() ?? input.payload?.vehicleId?.toString() ?? '',
      ]);

    const existing = await tx.workflowEventOutbox.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId.trim(),
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.toRecord(existing);
    }

    const envelopeResult = createWorkflowDomainEventEnvelope({
      organizationId: input.organizationId,
      eventType: input.eventType,
      source: input.source,
      payload: input.payload,
      eventVersion: input.eventVersion,
      occurredAt: input.occurredAt,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: input.metadata,
      eventId: input.eventId,
    });

    if (!envelopeResult.ok) {
      throw new WorkflowEventOutboxEnqueueError(
        envelopeResult.rejection.message,
        envelopeResult.rejection.reason,
        envelopeResult.rejection.field,
      );
    }

    const envelope = envelopeResult.envelope;

    const duplicateEventId = await tx.workflowEventOutbox.findUnique({
      where: { eventId: envelope.eventId },
    });
    if (duplicateEventId) {
      throw new WorkflowEventOutboxEnqueueError(
        `Duplicate eventId: ${envelope.eventId}`,
        'DUPLICATE_EVENT_ID',
        'eventId',
      );
    }

    try {
      const row = await tx.workflowEventOutbox.create({
        data: envelopeToOutboxCreateData(envelope, idempotencyKey),
      });
      return this.toRecord(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError
        && err.code === 'P2002'
      ) {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : '';
        if (target.includes('event_id')) {
          throw new WorkflowEventOutboxEnqueueError(
            `Duplicate eventId: ${envelope.eventId}`,
            'DUPLICATE_EVENT_ID',
            'eventId',
          );
        }
        const raced = await tx.workflowEventOutbox.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId.trim(),
              idempotencyKey,
            },
          },
        });
        if (raced) return this.toRecord(raced);
      }
      throw err;
    }
  }

  /** Map rejection/dead-letter without throwing — for observability sinks. */
  buildDeadLetterSummary(code: string, message: string): {
    lastErrorCode: string;
    lastErrorSummary: string;
  } {
    return {
      lastErrorCode: code.slice(0, 64),
      lastErrorSummary: truncateOutboxErrorSummary(message),
    };
  }

  private toRecord(row: {
    id: string;
    eventId: string;
    organizationId: string;
    eventType: string;
    status: WorkflowEventOutboxStatus;
    idempotencyKey: string;
    envelope: unknown;
    payload: unknown;
    eventVersion: string;
    schemaVersion: string;
    entityType: string | null;
    entityId: string | null;
    correlationId: string;
    causationId: string | null;
    source: string;
    occurredAt: Date;
    receivedAt: Date;
    metadata: unknown;
  }): WorkflowEventOutboxRecord {
    return {
      id: row.id,
      eventId: row.eventId,
      organizationId: row.organizationId,
      eventType: row.eventType,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      envelope: row.envelope as WorkflowEventOutboxRecord['envelope'],
    };
  }
}

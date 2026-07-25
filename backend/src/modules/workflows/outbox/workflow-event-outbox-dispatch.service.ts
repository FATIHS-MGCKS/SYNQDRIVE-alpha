import { Injectable } from '@nestjs/common';
import { buildWorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import { WorkflowEngineService, type WorkflowDomainEvent } from '../workflow-engine.service';
import { outboxRowToEnvelope } from './workflow-event-outbox.mapper';
import {
  WorkflowEventOutboxProcessingError,
  classifyRejectionReason,
} from './workflow-event-outbox-error.util';
import type { WorkflowEventOutboxRow } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';

@Injectable()
export class WorkflowEventOutboxDispatchService {
  constructor(
    private readonly outboxRepo: WorkflowEventOutboxRepository,
    private readonly engine: WorkflowEngineService,
  ) {}

  async dispatchClaimedRow(row: WorkflowEventOutboxRow): Promise<string[]> {
    if (row.status === 'DISPATCHED') {
      throw new WorkflowEventOutboxProcessingError(
        'Event already dispatched',
        'permanent',
        'ALREADY_DISPATCHED',
      );
    }

    const storedEnvelope = outboxRowToEnvelope(row);
    await this.assertTenant(row.organizationId);

    const validated = this.revalidateEnvelope(storedEnvelope, row.organizationId);
    const engineEvent = this.toEngineEvent(validated);
    return this.engine.processEvent(engineEvent);
  }

  private async assertTenant(organizationId: string): Promise<void> {
    const org = await this.outboxRepo.organizationExists(organizationId);
    if (!org) {
      throw new WorkflowEventOutboxProcessingError(
        `Organization ${organizationId} not found`,
        'tenant_violation',
        'TENANT_NOT_FOUND',
      );
    }
  }

  private revalidateEnvelope(
    envelope: WorkflowDomainEventEnvelope,
    organizationId: string,
  ): WorkflowDomainEventEnvelope {
    const result = buildWorkflowDomainEventEnvelope(
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        eventVersion: envelope.eventVersion,
        organizationId: envelope.organizationId,
        occurredAt: envelope.occurredAt,
        receivedAt: envelope.receivedAt,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        source: envelope.source,
        payload: { ...envelope.payload },
        metadata: { ...envelope.metadata },
        schemaVersion: envelope.schemaVersion,
        legacySourceKey: envelope.legacySourceKey,
      },
      { consumerOrganizationId: organizationId },
    );

    if (!result.ok) {
      const errorClass = classifyRejectionReason(result.rejection.reason);
      throw new WorkflowEventOutboxProcessingError(
        result.rejection.message,
        errorClass,
        result.rejection.reason,
      );
    }

    if (result.envelope.organizationId !== organizationId) {
      throw new WorkflowEventOutboxProcessingError(
        'Envelope organizationId does not match outbox row',
        'tenant_violation',
        'ORGANIZATION_MISMATCH',
      );
    }

    return result.envelope;
  }

  private toEngineEvent(envelope: WorkflowDomainEventEnvelope): WorkflowDomainEvent {
    return {
      organizationId: envelope.organizationId,
      type: envelope.eventType,
      entityType: envelope.entityType ?? undefined,
      entityId: envelope.entityId ?? undefined,
      payload: { ...envelope.payload },
      occurredAt: new Date(envelope.occurredAt),
      idempotencyKey: envelope.eventId,
    };
  }
}

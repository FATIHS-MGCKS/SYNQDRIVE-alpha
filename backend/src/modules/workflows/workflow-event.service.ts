import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngineService, type WorkflowDomainEvent } from './workflow-engine.service';
import {
  createWorkflowDomainEventEnvelope,
  legacyEngineEventToWireInput,
  rejectionToDeadLetterPayload,
  toSafeLogString,
} from './envelope';

@Injectable()
export class WorkflowEventService {
  private readonly logger = new Logger(WorkflowEventService.name);

  constructor(private readonly engine: WorkflowEngineService) {}

  /**
   * Emit a domain event into the workflow engine. Fire-and-forget safe: callers
   * may void this when automation must not block the primary transaction.
   */
  async emitEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const source =
      (event as WorkflowDomainEvent & { source?: string }).source ?? 'workflows';

    const result = createWorkflowDomainEventEnvelope({
      organizationId: event.organizationId,
      eventType: event.type,
      source,
      eventVersion: (event as WorkflowDomainEvent & { eventVersion?: string }).eventVersion,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      payload: event.payload ?? {},
      occurredAt: event.occurredAt,
      correlationId:
        (event as WorkflowDomainEvent & { correlationId?: string }).correlationId
        ?? event.idempotencyKey,
      causationId: (event as WorkflowDomainEvent & { causationId?: string }).causationId ?? null,
      metadata: (event as WorkflowDomainEvent & { metadata?: Record<string, unknown> }).metadata,
    });

    if (!result.ok) {
      const deadLetter = rejectionToDeadLetterPayload(
        result.rejection,
        legacyEngineEventToWireInput({ ...event, source }),
      );
      this.logger.error(
        `Workflow event rejected: ${result.rejection.reason} — ${result.rejection.message}`,
        JSON.stringify(deadLetter),
      );
      throw new Error(`Workflow event rejected: ${result.rejection.reason}`);
    }

    const { envelope } = result;

    if (envelope.legacySourceKey) {
      this.logger.warn(
        `Workflow event used legacy adapter ${envelope.legacySourceKey} → ${envelope.eventType}`,
      );
    }

    this.logger.debug(`Workflow event envelope accepted: ${toSafeLogString(envelope)}`);

    const engineEvent: WorkflowDomainEvent = {
      organizationId: envelope.organizationId,
      type: envelope.eventType,
      entityType: envelope.entityType ?? undefined,
      entityId: envelope.entityId ?? undefined,
      payload: { ...envelope.payload },
      occurredAt: new Date(envelope.occurredAt),
      idempotencyKey: envelope.eventId,
    };

    return this.engine.processEvent(engineEvent);
  }

  scheduleEmit(event: WorkflowDomainEvent): void {
    void this.emitEvent(event).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Workflow event processing failed for org ${event.organizationId} type ${event.type}: ${message}`,
        stack,
      );
    });
  }
}

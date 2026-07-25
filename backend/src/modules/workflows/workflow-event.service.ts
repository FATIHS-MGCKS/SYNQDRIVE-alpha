import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngineService, type WorkflowDomainEvent } from './workflow-engine.service';
import { validateAndNormalizeWorkflowEvent } from './registry';

@Injectable()
export class WorkflowEventService {
  private readonly logger = new Logger(WorkflowEventService.name);

  constructor(private readonly engine: WorkflowEngineService) {}

  /**
   * Emit a domain event into the workflow engine. Fire-and-forget safe: callers
   * may void this when automation must not block the primary transaction.
   */
  async emitEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const normalized = validateAndNormalizeWorkflowEvent({
      organizationId: event.organizationId,
      type: event.type,
      eventVersion: (event as WorkflowDomainEvent & { eventVersion?: string }).eventVersion,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      occurredAt: event.occurredAt,
      idempotencyKey: event.idempotencyKey,
    });

    if (normalized.legacySourceKey) {
      this.logger.warn(
        `Workflow event used legacy adapter ${normalized.legacySourceKey} → ${normalized.type}`,
      );
    }

    const engineEvent: WorkflowDomainEvent = {
      organizationId: normalized.organizationId,
      type: normalized.type,
      entityType: normalized.entityType,
      entityId: normalized.entityId,
      payload: normalized.payload,
      occurredAt: normalized.occurredAt,
      idempotencyKey: normalized.idempotencyKey,
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

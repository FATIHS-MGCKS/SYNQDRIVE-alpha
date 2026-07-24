import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngineService, type WorkflowDomainEvent } from './workflow-engine.service';
import { WorkflowTenantGuardService } from './workflow-tenant-guard.service';

@Injectable()
export class WorkflowEventService {
  private readonly logger = new Logger(WorkflowEventService.name);

  constructor(
    private readonly engine: WorkflowEngineService,
    private readonly tenantGuard: WorkflowTenantGuardService,
  ) {}

  /**
   * Emit a domain event into the workflow engine. Fire-and-forget safe: callers
   * may void this when automation must not block the primary transaction.
   */
  async emitEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const orgId = this.tenantGuard.assertEventOrganization(event);
    if (!event.type?.trim()) {
      throw new Error('event type is required for workflow events');
    }
    const normalized: WorkflowDomainEvent = {
      ...event,
      organizationId: orgId,
      type: event.type.trim(),
      payload: event.payload ?? {},
      occurredAt: event.occurredAt ?? new Date(),
    };
    return this.engine.processEvent(normalized);
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

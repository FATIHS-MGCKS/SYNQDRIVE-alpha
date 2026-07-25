import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';

export interface WorkflowEventOutboxDeadLetterSummary {
  id: string;
  eventId: string;
  eventType: string;
  correlationId: string;
  attemptCount: number;
  deadLetteredAt: string | null;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
}

@Injectable()
export class WorkflowEventOutboxReplayService {
  constructor(
    private readonly outboxRepo: WorkflowEventOutboxRepository,
    private readonly scheduler: WorkflowEventOutboxSchedulerService,
    private readonly observability: WorkflowEventOutboxObservabilityService,
  ) {}

  async listDeadLetterSummaries(
    organizationId: string,
    limit = 25,
  ): Promise<WorkflowEventOutboxDeadLetterSummary[]> {
    const rows = await this.outboxRepo.findDeadLetterSummaries(organizationId, limit);
    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      eventType: row.eventType,
      correlationId: row.correlationId,
      attemptCount: row.attemptCount,
      deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null,
      lastErrorCode: row.lastErrorCode,
      lastErrorSummary: row.lastErrorSummary,
    }));
  }

  async replayDeadLetter(input: {
    organizationId: string;
    outboxId: string;
    actorUserId?: string;
  }): Promise<{ outboxId: string; status: 'PENDING' }> {
    const row = await this.outboxRepo.findById(input.outboxId, input.organizationId);
    if (!row) {
      throw new NotFoundException(`Dead-letter outbox row ${input.outboxId} not found`);
    }

    const replayed = await this.outboxRepo.replayDeadLetter(input.outboxId, input.organizationId);
    if (!replayed) {
      throw new NotFoundException(
        `Outbox row ${input.outboxId} is not in DEAD_LETTER state for organization`,
      );
    }

    this.observability.log({
      organizationId: input.organizationId,
      eventType: row.eventType,
      eventId: row.eventId,
      correlationId: row.correlationId,
      operation: 'replay_requested',
      outboxId: row.id,
      actorUserId: input.actorUserId,
    });

    await this.scheduler.scheduleOutboxIds([input.outboxId]);

    return { outboxId: input.outboxId, status: 'PENDING' };
  }
}

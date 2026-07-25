import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
import { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';

/** Persistence, enqueue, scheduler — no engine dependency (avoids circular imports). */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ObservabilityModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.WORKFLOW_EVENT_OUTBOX }),
  ],
  providers: [
    WorkflowEventOutboxRepository,
    WorkflowEventOutboxEnqueueService,
    WorkflowEventOutboxSchedulerService,
    WorkflowEventOutboxObservabilityService,
  ],
  exports: [
    WorkflowEventOutboxEnqueueService,
    WorkflowEventOutboxSchedulerService,
    WorkflowEventOutboxRepository,
    WorkflowEventOutboxObservabilityService,
  ],
})
export class WorkflowEventOutboxCoreModule {}

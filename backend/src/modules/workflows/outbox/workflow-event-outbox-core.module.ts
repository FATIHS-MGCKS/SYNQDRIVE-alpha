import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { WorkflowIdempotencyModule } from '../idempotency';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
import { WorkflowEventOutboxEmitterService } from './workflow-event-outbox-emitter.service';
import { WorkflowBookingTimingEmitterService } from './workflow-booking-timing-emitter.service';
import { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';

/** Persistence, enqueue, scheduler — no engine dependency (avoids circular imports). */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ObservabilityModule,
    WorkflowIdempotencyModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.WORKFLOW_EVENT_OUTBOX }),
  ],
  providers: [
    WorkflowEventOutboxRepository,
    WorkflowEventOutboxEnqueueService,
    WorkflowEventOutboxEmitterService,
    WorkflowBookingTimingEmitterService,
    WorkflowEventOutboxSchedulerService,
    WorkflowEventOutboxObservabilityService,
  ],
  exports: [
    WorkflowEventOutboxEnqueueService,
    WorkflowEventOutboxEmitterService,
    WorkflowBookingTimingEmitterService,
    WorkflowEventOutboxSchedulerService,
    WorkflowEventOutboxRepository,
    WorkflowEventOutboxObservabilityService,
  ],
})
export class WorkflowEventOutboxCoreModule {}

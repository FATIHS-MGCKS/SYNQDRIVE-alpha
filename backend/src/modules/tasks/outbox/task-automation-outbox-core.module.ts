import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TaskAutomationOutboxRepository } from './task-automation-outbox.repository';
import { TaskAutomationOutboxEnqueueService } from './task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxSchedulerService } from './task-automation-outbox-scheduler.service';
import { TaskAutomationOutboxObservabilityService } from './task-automation-outbox-observability.service';
import { TaskAutomationOutboxExecutionContext } from './task-automation-outbox-execution.context';

/** Persistence, enqueue and processor — no dependency on TasksModule (avoids circular imports). */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ObservabilityModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.TASK_AUTOMATION }),
  ],
  providers: [
    TaskAutomationOutboxRepository,
    TaskAutomationOutboxExecutionContext,
    TaskAutomationOutboxObservabilityService,
    TaskAutomationOutboxEnqueueService,
    TaskAutomationOutboxSchedulerService,
  ],
  exports: [
    TaskAutomationOutboxEnqueueService,
    TaskAutomationOutboxSchedulerService,
    TaskAutomationOutboxRepository,
    TaskAutomationOutboxExecutionContext,
    TaskAutomationOutboxObservabilityService,
  ],
})
export class TaskAutomationOutboxCoreModule {}

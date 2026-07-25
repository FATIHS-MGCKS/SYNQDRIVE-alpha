import { Module } from '@nestjs/common';
import { WorkflowEventOutboxCoreModule } from './workflow-event-outbox-core.module';
import { WorkflowEventOutboxDispatchService } from './workflow-event-outbox-dispatch.service';
import { WorkflowEventOutboxProcessorService } from './workflow-event-outbox-processor.service';
import { WorkflowEventOutboxHealthService } from './workflow-event-outbox-health.service';
import { WorkflowEventOutboxReplayService } from './workflow-event-outbox-replay.service';
import { WorkflowEventOutboxAdminController } from './workflow-event-outbox-admin.controller';
import { WorkflowEngineService } from '../workflow-engine.service';
import { WorkflowActionExecutorService } from '../workflow-action-executor.service';
import { TasksModule } from '@modules/tasks/tasks.module';

/** Worker-side dispatch — imports workflow engine and executes outbox envelopes. */
@Module({
  imports: [WorkflowEventOutboxCoreModule, TasksModule],
  controllers: [WorkflowEventOutboxAdminController],
  providers: [
    WorkflowEngineService,
    WorkflowActionExecutorService,
    WorkflowEventOutboxDispatchService,
    WorkflowEventOutboxProcessorService,
    WorkflowEventOutboxHealthService,
    WorkflowEventOutboxReplayService,
  ],
  exports: [
    WorkflowEventOutboxDispatchService,
    WorkflowEventOutboxProcessorService,
    WorkflowEventOutboxHealthService,
    WorkflowEventOutboxReplayService,
    WorkflowEventOutboxCoreModule,
  ],
})
export class WorkflowEventOutboxModule {}

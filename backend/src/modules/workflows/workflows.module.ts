import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowEventOutboxCoreModule } from './outbox/workflow-event-outbox-core.module';
import { WorkflowMatcherModule } from './matcher/workflow-matcher.module';

@Module({
  imports: [TasksModule, WorkflowEventOutboxCoreModule, WorkflowMatcherModule],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowActionExecutorService,
  ],
  exports: [
    WorkflowsService,
    WorkflowEventService,
    WorkflowEngineService,
    WorkflowEventOutboxCoreModule,
    WorkflowMatcherModule,
  ],
})
export class WorkflowsModule {}

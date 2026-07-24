import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { WorkflowDryRunService } from './workflow-dry-run.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowActionExecutorService,
    WorkflowActionPreviewService,
    WorkflowDryRunService,
  ],
  exports: [WorkflowsService, WorkflowEventService, WorkflowEngineService],
})
export class WorkflowsModule {}

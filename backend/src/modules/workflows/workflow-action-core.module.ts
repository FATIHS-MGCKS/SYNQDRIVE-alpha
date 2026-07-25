import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { WorkflowDryRunService } from './workflow-dry-run.service';
import { WorkflowRuntimeRolloutModule } from './rollout/workflow-runtime-rollout.module';

@Module({
  imports: [forwardRef(() => TasksModule), WorkflowRuntimeRolloutModule],
  providers: [WorkflowActionExecutorService, WorkflowActionPreviewService, WorkflowDryRunService],
  exports: [WorkflowActionExecutorService, WorkflowActionPreviewService, WorkflowDryRunService],
})
export class WorkflowActionCoreModule {}

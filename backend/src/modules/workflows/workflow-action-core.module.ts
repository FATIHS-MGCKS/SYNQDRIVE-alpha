import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';

@Module({
  imports: [forwardRef(() => TasksModule)],
  providers: [WorkflowActionExecutorService, WorkflowActionPreviewService],
  exports: [WorkflowActionExecutorService, WorkflowActionPreviewService],
})
export class WorkflowActionCoreModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowActionCoreModule } from '../workflow-action-core.module';
import { WorkflowShadowModule } from '../shadow/workflow-shadow.module';
import { TaskAutomationExecutionRouterService } from './task-automation-execution-router.service';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';

@Module({
  imports: [
    forwardRef(() => TasksModule),
    WorkflowActionCoreModule,
    WorkflowShadowModule,
  ],
  providers: [
    TaskAutomationWorkflowTemplateService,
    TaskAutomationWorkflowMaterializerService,
    TaskAutomationExecutionRouterService,
  ],
  exports: [
    TaskAutomationWorkflowTemplateService,
    TaskAutomationWorkflowMaterializerService,
    TaskAutomationExecutionRouterService,
  ],
})
export class TaskAutomationWorkflowBridgeModule {}

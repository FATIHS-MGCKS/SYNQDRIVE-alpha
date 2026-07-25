import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowActionCoreModule } from '../workflow-action-core.module';
import { WorkflowRuntimeRolloutModule } from '../rollout/workflow-runtime-rollout.module';
import { WorkflowShadowModule } from '../shadow/workflow-shadow.module';
import { TaskAutomationExecutionRouterService } from './task-automation-execution-router.service';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';

@Module({
  imports: [
    forwardRef(() => TasksModule),
    WorkflowActionCoreModule,
    WorkflowRuntimeRolloutModule,
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

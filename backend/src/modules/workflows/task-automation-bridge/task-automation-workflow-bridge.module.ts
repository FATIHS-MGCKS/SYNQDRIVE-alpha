import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import taskAutomationWorkflowRuntimeConfig from '@config/task-automation-workflow-runtime.config';
import { WorkflowActionRegistryModule } from '../actions/workflow-action-registry.module';
import { TaskAutomationExecutionRouterService } from './task-automation-execution-router.service';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(taskAutomationWorkflowRuntimeConfig),
    forwardRef(() => WorkflowActionRegistryModule),
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

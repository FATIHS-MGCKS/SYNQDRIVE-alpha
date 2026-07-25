import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowActionRegistryModule } from './actions/workflow-action-registry.module';
import { WorkflowRiskModule } from './risk/workflow-risk.module';
import { WorkflowPermissionService } from './permissions/workflow-permission.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, WorkflowActionRegistryModule, WorkflowRiskModule],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowActionExecutorService,
    WorkflowPermissionService,
  ],
  exports: [WorkflowsService, WorkflowEventService, WorkflowEngineService, WorkflowPermissionService],
})
export class WorkflowsModule {}

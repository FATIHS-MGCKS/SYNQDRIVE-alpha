import { Module, forwardRef } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionCoreModule } from './workflow-action-core.module';
import { TaskAutomationWorkflowBridgeModule } from './task-automation-bridge/task-automation-workflow-bridge.module';
import { TaskAutomationWorkflowMigrationService } from './migration/task-automation-workflow-migration.service';
import { TaskAutomationWorkflowMigrationController } from './migration/task-automation-workflow-migration.controller';
import { WorkflowMakerCheckerModule } from './maker-checker/workflow-maker-checker.module';
import { WorkflowAuditModule } from './audit/workflow-audit.module';
import { WorkflowShadowModule } from './shadow/workflow-shadow.module';
import { WorkflowRuntimeRolloutModule } from './rollout/workflow-runtime-rollout.module';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [
    forwardRef(() => TasksModule),
    WorkflowActionCoreModule,
    TaskAutomationWorkflowBridgeModule,
    WorkflowMakerCheckerModule,
    WorkflowAuditModule,
    WorkflowShadowModule,
    WorkflowRuntimeRolloutModule,
  ],
  controllers: [WorkflowsController, TaskAutomationWorkflowMigrationController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    TaskAutomationWorkflowMigrationService,
  ],
  exports: [
    WorkflowsService,
    WorkflowEventService,
    WorkflowEngineService,
    WorkflowActionCoreModule,
    TaskAutomationWorkflowBridgeModule,
    TaskAutomationWorkflowMigrationService,
    WorkflowShadowModule,
    WorkflowRuntimeRolloutModule,
  ],
})
export class WorkflowsModule {}

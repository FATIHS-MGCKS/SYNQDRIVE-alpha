import { Module, forwardRef } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionCoreModule } from './workflow-action-core.module';
import { TaskAutomationWorkflowBridgeModule } from './task-automation-bridge/task-automation-workflow-bridge.module';
import { TaskAutomationWorkflowMigrationService } from './migration/task-automation-workflow-migration.service';
import { TaskAutomationWorkflowMigrationController } from './migration/task-automation-workflow-migration.controller';
import { WorkflowDryRunService } from './workflow-dry-run.service';
import { WorkflowMakerCheckerModule } from './maker-checker/workflow-maker-checker.module';
import { WorkflowAuditModule } from './audit/workflow-audit.module';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [
    forwardRef(() => TasksModule),
    WorkflowActionCoreModule,
    TaskAutomationWorkflowBridgeModule,
    WorkflowMakerCheckerModule,
    WorkflowAuditModule,
  ],
  controllers: [WorkflowsController, TaskAutomationWorkflowMigrationController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowDryRunService,
    TaskAutomationWorkflowMigrationService,
  ],
  exports: [
    WorkflowsService,
    WorkflowEventService,
    WorkflowEngineService,
    WorkflowActionCoreModule,
    TaskAutomationWorkflowBridgeModule,
    TaskAutomationWorkflowMigrationService,
  ],
})
export class WorkflowsModule {}

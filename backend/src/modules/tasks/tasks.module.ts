import { Module, forwardRef } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { WorkflowMakerCheckerModule } from '@modules/workflows/maker-checker/workflow-maker-checker.module';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskAutomationService } from './task-automation.service';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TaskLinkedObjectResolverService } from './task-linked-object-resolver.service';
import { TaskAutomationOutboxCoreModule } from './outbox/task-automation-outbox-core.module';
import { TaskDataDiagnosticService } from './diagnostic/task-data-diagnostic.service';
import { TaskDataRepairService } from './diagnostic/task-data-repair.service';
import { TaskAutomationRuleResolverService } from './automation/task-automation-rule-resolver.service';
import { TaskAutomationRuleOverrideService } from './automation/task-automation-rule-override.service';
import { TaskAutomationAdminService } from './automation/task-automation-admin.service';
import { TaskAutomationAdminController } from './automation/task-automation-admin.controller';
import { TaskAutomationSimulationService } from './automation/task-automation-simulation.service';
import { TaskPermissionService } from './task-permission.service';

@Module({
  imports: [ActivityLogModule, TaskAutomationOutboxCoreModule, WorkflowMakerCheckerModule, forwardRef(() => WorkflowsModule), forwardRef(() => NotificationsModule)],
  controllers: [TasksController, TaskAutomationAdminController],
  providers: [
    TasksService,
    TaskAutomationService,
    VehicleCleaningTaskService,
    TaskLinkedObjectResolverService,
    TaskDataDiagnosticService,
    TaskDataRepairService,
    TaskAutomationRuleResolverService,
    TaskAutomationRuleOverrideService,
    TaskAutomationAdminService,
    TaskAutomationSimulationService,
    TaskPermissionService,
  ],
  exports: [
    TasksService,
    TaskAutomationService,
    TaskAutomationAdminService,
    VehicleCleaningTaskService,
    TaskLinkedObjectResolverService,
    TaskAutomationOutboxCoreModule,
    TaskDataDiagnosticService,
    TaskDataRepairService,
    TaskAutomationRuleResolverService,
    TaskAutomationRuleOverrideService,
  ],
})
export class TasksModule {}

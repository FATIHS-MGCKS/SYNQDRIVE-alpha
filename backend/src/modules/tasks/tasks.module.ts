import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskAutomationService } from './task-automation.service';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TaskLinkedObjectResolverService } from './task-linked-object-resolver.service';
import { TaskAutomationOutboxCoreModule } from './outbox/task-automation-outbox-core.module';

@Module({
  imports: [ActivityLogModule, TaskAutomationOutboxCoreModule],
  controllers: [TasksController],
  providers: [TasksService, TaskAutomationService, VehicleCleaningTaskService, TaskLinkedObjectResolverService],
  exports: [TasksService, TaskAutomationService, VehicleCleaningTaskService, TaskLinkedObjectResolverService, TaskAutomationOutboxCoreModule],
})
export class TasksModule {}

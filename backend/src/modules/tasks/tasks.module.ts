import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskAutomationService } from './task-automation.service';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskAutomationService, VehicleCleaningTaskService],
  exports: [TasksService, TaskAutomationService, VehicleCleaningTaskService],
})
export class TasksModule {}

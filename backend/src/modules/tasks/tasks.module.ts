import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskAutomationService } from './task-automation.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskAutomationService],
  exports: [TasksService, TaskAutomationService],
})
export class TasksModule {}

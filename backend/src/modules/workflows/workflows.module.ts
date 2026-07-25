import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowDefinitionsController } from './workflow-definitions.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowDefinitionLifecycleService } from './workflow-definition-lifecycle.service';
import { TasksModule } from '@modules/tasks/tasks.module';
import { PrismaModule } from '@shared/database/prisma.module';

@Module({
  imports: [TasksModule, PrismaModule],
  controllers: [WorkflowsController, WorkflowDefinitionsController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowActionExecutorService,
    WorkflowDefinitionLifecycleService,
  ],
  exports: [
    WorkflowsService,
    WorkflowEventService,
    WorkflowEngineService,
    WorkflowDefinitionLifecycleService,
  ],
})
export class WorkflowsModule {}

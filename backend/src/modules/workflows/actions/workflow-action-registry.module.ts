import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { WorkflowActionRegistryExecutorService } from './workflow-action-registry.executor.service';
import { WorkflowActionRegistryService } from './workflow-action-registry.service';
import { WorkflowActionNoopSecretsResolver } from './workflow-action-secrets.resolver';

@Module({
  imports: [PrismaModule, TasksModule],
  providers: [
    ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
    workflowActionHandlersProvider,
    WorkflowActionRegistryService,
    WorkflowActionRegistryExecutorService,
    WorkflowActionNoopSecretsResolver,
  ],
  exports: [
    WorkflowActionRegistryService,
    WorkflowActionRegistryExecutorService,
    WorkflowActionNoopSecretsResolver,
  ],
})
export class WorkflowActionRegistryModule {}

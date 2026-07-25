import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { WorkflowActionAuditService } from './adapters/workflow-action-audit.service';
import { WorkflowActionApprovalService } from './adapters/workflow-action-approval.service';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { WorkflowActionRegistryExecutorService } from './workflow-action-registry.executor.service';
import { WorkflowActionRegistryService } from './workflow-action-registry.service';
import { WorkflowActionNoopSecretsResolver } from './workflow-action-secrets.resolver';

@Module({
  imports: [PrismaModule, TasksModule, NotificationsModule, RentalHealthModule],
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
    WorkflowActionAuditService,
    WorkflowActionApprovalService,
  ],
})
export class WorkflowActionRegistryModule {}

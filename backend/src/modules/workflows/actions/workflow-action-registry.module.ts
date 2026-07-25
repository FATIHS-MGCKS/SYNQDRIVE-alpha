import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import emailConfig from '@config/email.config';
import { WorkflowActionAuditService } from './adapters/workflow-action-audit.service';
import { WorkflowActionApprovalService } from './adapters/workflow-action-approval.service';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { WorkflowActionRegistryExecutorService } from './workflow-action-registry.executor.service';
import { WorkflowActionRegistryService } from './workflow-action-registry.service';
import { WorkflowActionNoopSecretsResolver } from './workflow-action-secrets.resolver';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(emailConfig),
    forwardRef(() => TasksModule),
    NotificationsModule,
    RentalHealthModule,
    OutboundEmailModule,
    forwardRef(() => DocumentsModule),
  ],
  providers: [
    WorkflowActionPolicyService,
    WorkflowActionSafetyBlockService,
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
    WorkflowActionPolicyService,
    WorkflowActionSafetyBlockService,
  ],
})
export class WorkflowActionRegistryModule {}

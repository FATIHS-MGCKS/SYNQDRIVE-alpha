import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workflowRuntimeConfig from '@config/workflow-runtime.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { WorkflowActionExecutorService } from '../workflow-action-executor.service';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowActionRunRuntimeService } from './workflow-action-run-runtime.service';
import { WorkflowActionRunExecutorService } from './workflow-action-run-executor.service';
import { WorkflowRunOrchestratorRepository } from './workflow-run-orchestrator.repository';
import { WorkflowRunOrchestratorService } from './workflow-run-orchestrator.service';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowRunWorkerService } from './workflow-run-worker.service';
import { WorkflowRuntimeActionExecutorAdapter } from './workflow-runtime-action-executor.adapter';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import { WorkflowApprovalController } from './approval/workflow-approval.controller';
import { WorkflowApprovalRepository } from './approval/workflow-approval.repository';
import { WorkflowApprovalPauseService } from './approval/workflow-approval-pause.service';
import { WorkflowApprovalResumeService } from './approval/workflow-approval-resume.service';
import { WorkflowApprovalPreExecutionValidator } from './approval/workflow-approval-pre-execution.validator';
import { WorkflowApprovalNotificationPrepareService } from './approval/workflow-approval-notification.prepare.service';
import { WorkflowApprovalLegacyBridgeService } from './approval/workflow-approval-legacy.bridge';

@Module({
  imports: [PrismaModule, TasksModule, ConfigModule.forFeature(workflowRuntimeConfig)],
  controllers: [WorkflowApprovalController],
  providers: [
    WorkflowRunRuntimeRepository,
    WorkflowActionRunRuntimeRepository,
    WorkflowRunOrchestratorRepository,
    WorkflowRuntimeStatusAuditService,
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowRunOrchestratorService,
    WorkflowApprovalRepository,
    WorkflowApprovalPreExecutionValidator,
    WorkflowApprovalNotificationPrepareService,
    WorkflowApprovalLegacyBridgeService,
    WorkflowApprovalPauseService,
    WorkflowActionRunExecutorService,
    WorkflowApprovalResumeService,
    WorkflowRunWorkerService,
    WorkflowRuntimeActionExecutorAdapter,
    WorkflowActionExecutorService,
  ],
  exports: [
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowRunOrchestratorService,
    WorkflowActionRunExecutorService,
    WorkflowApprovalPauseService,
    WorkflowApprovalResumeService,
    WorkflowRunWorkerService,
  ],
})
export class WorkflowRuntimeModule {}

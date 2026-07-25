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
import { WorkflowRunCancellationService } from './cancellation/workflow-run-cancellation.service';
import { WorkflowTimerRepository } from './cancellation/workflow-timer.repository';
import { WorkflowRunController } from './workflow-run.controller';
import { WorkflowRuntimeSchedulerService } from './workflow-runtime-scheduler.service';
import { WorkflowActionFallbackService } from './error-strategy/workflow-action-fallback.service';
import { WorkflowActionCompensationService } from './error-strategy/workflow-action-compensation.service';
import { WorkflowErrorStrategyExplainService } from './error-strategy/workflow-error-strategy-explain.service';

@Module({
  imports: [PrismaModule, TasksModule, ConfigModule.forFeature(workflowRuntimeConfig)],
  controllers: [WorkflowApprovalController, WorkflowRunController],
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
    WorkflowTimerRepository,
    WorkflowRunCancellationService,
    WorkflowRunWorkerService,
    WorkflowRuntimeSchedulerService,
    WorkflowActionFallbackService,
    WorkflowActionCompensationService,
    WorkflowErrorStrategyExplainService,
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
    WorkflowRunCancellationService,
    WorkflowRunWorkerService,
    WorkflowRuntimeSchedulerService,
  ],
})
export class WorkflowRuntimeModule {}

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

@Module({
  imports: [PrismaModule, TasksModule, ConfigModule.forFeature(workflowRuntimeConfig)],
  providers: [
    WorkflowRunRuntimeRepository,
    WorkflowActionRunRuntimeRepository,
    WorkflowRunOrchestratorRepository,
    WorkflowRuntimeStatusAuditService,
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowRunOrchestratorService,
    WorkflowActionRunExecutorService,
    WorkflowRunWorkerService,
    WorkflowRuntimeActionExecutorAdapter,
    WorkflowActionExecutorService,
  ],
  exports: [
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowRunOrchestratorService,
    WorkflowActionRunExecutorService,
    WorkflowRunWorkerService,
  ],
})
export class WorkflowRuntimeModule {}

import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowDefinitionsController } from './workflow-definitions.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowDefinitionLifecycleService } from './workflow-definition-lifecycle.service';
import { WorkflowRunRuntimeService } from './runtime/workflow-run-runtime.service';
import { WorkflowActionRunRuntimeService } from './runtime/workflow-action-run-runtime.service';
import { WorkflowRunRuntimeRepository } from './runtime/workflow-run-runtime.repository';
import { WorkflowActionRunRuntimeRepository } from './runtime/workflow-action-run-runtime.repository';
import { WorkflowRuntimeStatusAuditService } from './runtime/workflow-runtime-status-audit.service';
import { WorkflowExecutionSnapshotController } from './snapshot/workflow-execution-snapshot.controller';
import { WorkflowExecutionSnapshotRepository } from './snapshot/workflow-execution-snapshot.repository';
import { WorkflowExecutionSnapshotService } from './snapshot/workflow-execution-snapshot.service';
import { TasksModule } from '@modules/tasks/tasks.module';
import { PrismaModule } from '@shared/database/prisma.module';

@Module({
  imports: [TasksModule, PrismaModule],
  controllers: [
    WorkflowsController,
    WorkflowDefinitionsController,
    WorkflowExecutionSnapshotController,
  ],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    WorkflowEventService,
    WorkflowActionExecutorService,
    WorkflowDefinitionLifecycleService,
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowRunRuntimeRepository,
    WorkflowActionRunRuntimeRepository,
    WorkflowRuntimeStatusAuditService,
    WorkflowExecutionSnapshotService,
    WorkflowExecutionSnapshotRepository,
  ],
  exports: [
    WorkflowsService,
    WorkflowEventService,
    WorkflowEngineService,
    WorkflowDefinitionLifecycleService,
    WorkflowRunRuntimeService,
    WorkflowActionRunRuntimeService,
    WorkflowExecutionSnapshotService,
  ],
})
export class WorkflowsModule {}

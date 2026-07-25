import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workflowRuntimeRolloutConfig from '@config/workflow-runtime-rollout.config';
import { WorkflowAuditModule } from '../audit/workflow-audit.module';
import { WorkflowRuntimeRolloutService } from './workflow-runtime-rollout.service';
import { WorkflowRuntimeRolloutGatesService } from './workflow-runtime-rollout-gates.service';
import { WorkflowRuntimeRolloutController } from './workflow-runtime-rollout.controller';

@Module({
  imports: [ConfigModule.forFeature(workflowRuntimeRolloutConfig), WorkflowAuditModule],
  controllers: [WorkflowRuntimeRolloutController],
  providers: [WorkflowRuntimeRolloutService, WorkflowRuntimeRolloutGatesService],
  exports: [WorkflowRuntimeRolloutService, WorkflowRuntimeRolloutGatesService],
})
export class WorkflowRuntimeRolloutModule {}

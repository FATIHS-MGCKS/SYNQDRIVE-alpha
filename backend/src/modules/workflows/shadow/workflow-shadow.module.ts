import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workflowShadowConfig from '@config/workflow-shadow.config';
import { WorkflowActionCoreModule } from '../workflow-action-core.module';
import { WorkflowShadowGateService } from './workflow-shadow-gate.service';
import { WorkflowShadowService } from './workflow-shadow.service';
import { WorkflowShadowRetentionService } from './workflow-shadow-retention.service';
import { WorkflowShadowController } from './workflow-shadow.controller';

@Module({
  imports: [ConfigModule.forFeature(workflowShadowConfig), WorkflowActionCoreModule],
  controllers: [WorkflowShadowController],
  providers: [
    WorkflowShadowGateService,
    WorkflowShadowService,
    WorkflowShadowRetentionService,
  ],
  exports: [WorkflowShadowGateService, WorkflowShadowService, WorkflowShadowRetentionService],
})
export class WorkflowShadowModule {}

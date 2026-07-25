import { Module } from '@nestjs/common';
import { WorkflowMakerCheckerService } from './workflow-maker-checker.service';
import { WorkflowAuditModule } from '../audit/workflow-audit.module';

@Module({
  imports: [WorkflowAuditModule],
  providers: [WorkflowMakerCheckerService],
  exports: [WorkflowMakerCheckerService],
})
export class WorkflowMakerCheckerModule {}

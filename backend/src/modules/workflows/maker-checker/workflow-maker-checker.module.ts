import { Module } from '@nestjs/common';
import { WorkflowMakerCheckerService } from './workflow-maker-checker.service';

@Module({
  providers: [WorkflowMakerCheckerService],
  exports: [WorkflowMakerCheckerService],
})
export class WorkflowMakerCheckerModule {}

import { Module } from '@nestjs/common';
import { WorkflowRiskCalculatorService } from './workflow-risk-calculator.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';

@Module({
  providers: [WorkflowRiskCalculatorService, WorkflowActionSafetyBlockService],
  exports: [WorkflowRiskCalculatorService],
})
export class WorkflowRiskModule {}

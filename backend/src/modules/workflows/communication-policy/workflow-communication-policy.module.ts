import { Module } from '@nestjs/common';
import { WorkflowCommunicationPolicyEngineService } from './workflow-communication-policy-engine.service';

@Module({
  providers: [WorkflowCommunicationPolicyEngineService],
  exports: [WorkflowCommunicationPolicyEngineService],
})
export class WorkflowCommunicationPolicyModule {}

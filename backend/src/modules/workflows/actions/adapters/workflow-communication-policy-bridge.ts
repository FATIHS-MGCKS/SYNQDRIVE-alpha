import { Injectable } from '@nestjs/common';
import type {
  WorkflowCommunicationPolicyResult,
  WorkflowCommunicationPolicySnapshot,
} from '../../communication-policy';

export interface WorkflowChannelCommunicationPolicyResult {
  allowed: boolean;
  reason?: string;
  code?: string;
  decision: WorkflowCommunicationPolicyResult['decision'];
  reasonCode?: WorkflowCommunicationPolicyResult['reasonCode'];
  snapshot?: WorkflowCommunicationPolicySnapshot;
  delayUntil?: string;
  fallbackChannel?: WorkflowCommunicationPolicyResult['fallbackChannel'];
}

export function mapEngineResultToChannel(
  result: WorkflowCommunicationPolicyResult,
): WorkflowChannelCommunicationPolicyResult {
  return {
    allowed: result.allowed,
    reason: result.explanation,
    code: result.reasonCode,
    decision: result.decision,
    reasonCode: result.reasonCode,
    snapshot: result.snapshot,
    delayUntil: result.delayUntil,
    fallbackChannel: result.fallbackChannel,
  };
}

@Injectable()
export class WorkflowCommunicationPolicyBridgeService {
  mapEngineResult(result: WorkflowCommunicationPolicyResult): WorkflowChannelCommunicationPolicyResult {
    return mapEngineResultToChannel(result);
  }
}

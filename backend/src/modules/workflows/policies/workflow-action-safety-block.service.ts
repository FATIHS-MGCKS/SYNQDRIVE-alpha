import { Injectable } from '@nestjs/common';
import type { WorkflowActionPolicyEvaluateInput } from './workflow-action-policy.types';

export interface WorkflowSafetyBlockResult {
  blocked: boolean;
  reason?: string;
  code?: 'SAFETY_BLOCK' | 'UNVERIFIED_DIAGNOSIS';
}

/**
 * Real-time safety blocks that override frozen policy snapshots.
 * Used for emergency stops and clinical/diagnostic guardrails.
 */
@Injectable()
export class WorkflowActionSafetyBlockService {
  private readonly globalBlocks = new Map<string, string>();

  /** Register an operational safety block (e.g. incident response). */
  blockAction(actionType: string, reason: string): void {
    this.globalBlocks.set(actionType, reason);
  }

  clearBlock(actionType: string): void {
    this.globalBlocks.delete(actionType);
  }

  evaluate(input: WorkflowActionPolicyEvaluateInput): WorkflowSafetyBlockResult {
    const globalReason = this.globalBlocks.get(input.actionType);
    if (globalReason) {
      return { blocked: true, reason: globalReason, code: 'SAFETY_BLOCK' };
    }

    const diagnosisBlock = this.evaluateUnverifiedDiagnosisBlock(input);
    if (diagnosisBlock.blocked) return diagnosisBlock;

    return { blocked: false };
  }

  private evaluateUnverifiedDiagnosisBlock(
    input: WorkflowActionPolicyEvaluateInput,
  ): WorkflowSafetyBlockResult {
    const criticalTriggers = new Set([
      'vehicle.health.critical',
      'vehicle.dtc.critical',
    ]);
    if (!criticalTriggers.has(input.eventType)) return { blocked: false };

    const customerFacingActions = new Set([
      'email.send',
      'customer.contact.email',
      'customer.contact.whatsapp',
      'whatsapp.template.send',
      'whatsapp.ai_message.send',
      'sms.send',
      'voice.call',
    ]);
    if (!customerFacingActions.has(input.actionType)) return { blocked: false };

    const verified = input.actionConfig?.verifiedDiagnosis === true;
    if (verified) return { blocked: false };

    return {
      blocked: true,
      code: 'UNVERIFIED_DIAGNOSIS',
      reason:
        'Critical vehicle fault triggers forbid outbound diagnostic messaging without verifiedDiagnosis=true',
    };
  }
}

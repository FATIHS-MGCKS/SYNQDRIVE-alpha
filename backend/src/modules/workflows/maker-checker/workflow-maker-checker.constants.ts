import type { WorkflowMakerCheckerOperation } from '@prisma/client';

/** Default approval TTL — pending requests expire and must be resubmitted. */
export const WORKFLOW_MAKER_CHECKER_TTL_MS = 72 * 60 * 60 * 1000;

export const WORKFLOW_SENSITIVE_ACTION_TYPES = new Set<string>([
  'ai.suggest_action',
  'email.send',
  'sms.send',
  'whatsapp.template.send',
  'whatsapp.ai_message.send',
  'voice.call.start',
  'booking.cancel',
  'invoice.charge',
  'customer.block',
  'customer.contact.send',
]);

export const WORKFLOW_CRITICAL_ACTION_TYPES = new Set<string>([
  'ai.suggest_action',
  'voice.call.start',
  'booking.cancel',
  'invoice.charge',
  'customer.block',
]);

export const WORKFLOW_EXTERNAL_AI_ACTION_TYPES = new Set<string>([
  'whatsapp.ai_message.send',
  'ai.suggest_action',
]);

export type WorkflowSensitivity = 'LOW' | 'HIGH' | 'CRITICAL';

export function resolveActionOperation(actionType: string): WorkflowMakerCheckerOperation {
  const type = actionType.toLowerCase();
  if (type.includes('voice') || type === 'voice.call.start') {
    return 'WORKFLOW_APPROVE_AI_CALL';
  }
  if (type.includes('booking.cancel') || type === 'booking.cancel') {
    return 'WORKFLOW_BOOKING_CANCEL';
  }
  if (type.includes('customer.block') || type === 'customer.block') {
    return 'WORKFLOW_CUSTOMER_BLOCK';
  }
  if (type.includes('invoice.charge') || type.includes('payment')) {
    return 'WORKFLOW_PAYMENT_CHARGE';
  }
  if (WORKFLOW_EXTERNAL_AI_ACTION_TYPES.has(type)) {
    return 'WORKFLOW_ACTIVATE_EXTERNAL_AI';
  }
  return 'WORKFLOW_RUNTIME_ACTION';
}

export function assessWorkflowSensitivity(actions: Array<{ type: string }>): WorkflowSensitivity {
  let max: WorkflowSensitivity = 'LOW';
  for (const action of actions) {
    const type = action.type;
    if (WORKFLOW_CRITICAL_ACTION_TYPES.has(type)) return 'CRITICAL';
    if (WORKFLOW_SENSITIVE_ACTION_TYPES.has(type)) max = 'HIGH';
  }
  return max;
}

export function requiresMakerCheckerForPublish(sensitivity: WorkflowSensitivity): boolean {
  return sensitivity === 'HIGH' || sensitivity === 'CRITICAL';
}

export function requiresMakerCheckerForRuntimeAction(actionType: string): boolean {
  return WORKFLOW_SENSITIVE_ACTION_TYPES.has(actionType);
}

/** Admin force-replay of dead-letter rows always requires dual control. */
export function requiresMakerCheckerForDeadLetterReplay(): boolean {
  return true;
}

import { APPROVAL_REQUIRED_ACTIONS } from './workflow.constants';
import type { WorkflowActionRiskClass } from './workflow-execution-plan.types';

const EXTERNAL_ACTION_PREFIXES = ['channel.', 'notification.send', 'voice.call'];
const EXTERNAL_ACTION_TYPES = new Set([
  'notification.prepare',
  'channel.email.send',
  'channel.whatsapp.send',
  'channel.sms.send',
  'voice.call.initiate',
]);

const HUMAN_ACTION_TYPES = new Set([
  'workflow.approval.request',
  'ai.suggest_action',
]);

const KNOWN_INTERNAL = new Set([
  'task.create',
  'alert.create',
  'vehicle.status.update',
]);

export function classifyActionRisk(actionType: string): WorkflowActionRiskClass {
  if (HUMAN_ACTION_TYPES.has(actionType) || APPROVAL_REQUIRED_ACTIONS.has(actionType)) {
    return 'HUMAN';
  }
  if (
    EXTERNAL_ACTION_TYPES.has(actionType) ||
    EXTERNAL_ACTION_PREFIXES.some((p) => actionType.startsWith(p))
  ) {
    return 'EXTERNAL';
  }
  if (KNOWN_INTERNAL.has(actionType)) {
    return 'INTERNAL';
  }
  return 'UNKNOWN';
}

export function actionRequiresApproval(
  actionType: string,
  explicitFlag?: boolean,
): boolean {
  if (explicitFlag === true) return true;
  return APPROVAL_REQUIRED_ACTIONS.has(actionType);
}

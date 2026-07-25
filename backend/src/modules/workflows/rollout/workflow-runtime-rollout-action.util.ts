import type { WorkflowRuntimeChannelFlag } from './workflow-runtime-rollout.contract';
import { classifyActionRisk } from '../workflow-action-risk';
import { WORKFLOW_CRITICAL_ACTION_TYPES } from '../maker-checker/workflow-maker-checker.constants';

const EMAIL_ACTIONS = new Set([
  'channel.email.send',
  'email.send',
  'notification.send',
  'customer.contact.send',
]);

const WHATSAPP_ACTIONS = new Set([
  'channel.whatsapp.send',
  'whatsapp.template.send',
  'whatsapp.ai_message.send',
]);

const SMS_ACTIONS = new Set(['channel.sms.send', 'sms.send']);

const VOICE_ACTIONS = new Set(['voice.call.initiate', 'voice.call.start']);

const AI_ACTIONS = new Set([
  'ai.suggest_action',
  'ai_suggest',
  'ai_execute',
  'ai_send_message',
  'whatsapp.ai_message.send',
]);

export function resolveActionChannelFlag(actionType: string): WorkflowRuntimeChannelFlag | null {
  const type = actionType.toLowerCase();
  if (EMAIL_ACTIONS.has(type) || type.includes('email')) return 'email';
  if (WHATSAPP_ACTIONS.has(type) || type.includes('whatsapp')) return 'whatsapp';
  if (SMS_ACTIONS.has(type) || type.includes('sms')) return 'sms';
  if (VOICE_ACTIONS.has(type) || type.includes('voice')) return 'voice';
  if (AI_ACTIONS.has(type) || type.startsWith('ai.')) return 'ai';
  if (WORKFLOW_CRITICAL_ACTION_TYPES.has(type)) return 'critical';
  return null;
}

export function isInternalWorkflowAction(actionType: string): boolean {
  const channel = resolveActionChannelFlag(actionType);
  if (channel != null) return false;
  const risk = classifyActionRisk(actionType);
  return risk === 'INTERNAL' || risk === 'HUMAN';
}

export function isExternalWorkflowAction(actionType: string): boolean {
  return resolveActionChannelFlag(actionType) != null || classifyActionRisk(actionType) === 'EXTERNAL';
}

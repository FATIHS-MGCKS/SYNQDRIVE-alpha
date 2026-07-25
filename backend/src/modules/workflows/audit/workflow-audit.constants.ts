import type { WorkflowAuditEventType, WorkflowAuditRetentionClass } from '@prisma/client';

export const WORKFLOW_AUDIT_RETENTION_DAYS: Record<WorkflowAuditRetentionClass, number> = {
  TECHNICAL_LOG: 90,
  REVISION_AUDIT: 365,
  GOVERNANCE_AUDIT: 2555, // ~7 years
};

export const WORKFLOW_AUDIT_SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'authorization',
  'bearer',
  'documentnumber',
  'document_number',
  'passport',
  'license',
  'iban',
  'bic',
  'creditcard',
  'credit_card',
  'cvv',
  'ssn',
  'taxid',
  'tax_id',
  'signature',
  'transcript',
  'messagebody',
  'message_body',
  'fullmessage',
  'full_message',
  'rawpayload',
  'raw_payload',
] as const;

export const WORKFLOW_AUDIT_EVENT_RETENTION: Record<
  WorkflowAuditEventType,
  WorkflowAuditRetentionClass
> = {
  WORKFLOW_CREATED: 'REVISION_AUDIT',
  WORKFLOW_DRAFT_CHANGED: 'REVISION_AUDIT',
  WORKFLOW_PUBLISHED: 'GOVERNANCE_AUDIT',
  WORKFLOW_ACTIVATED: 'GOVERNANCE_AUDIT',
  WORKFLOW_DEACTIVATED: 'GOVERNANCE_AUDIT',
  WORKFLOW_ARCHIVED: 'GOVERNANCE_AUDIT',
  WORKFLOW_DRY_RUN: 'TECHNICAL_LOG',
  WORKFLOW_EXTERNAL_TEST: 'TECHNICAL_LOG',
  WORKFLOW_RUN_STARTED: 'TECHNICAL_LOG',
  WORKFLOW_CONDITION_EVALUATED: 'TECHNICAL_LOG',
  WORKFLOW_ACTION_STARTED: 'TECHNICAL_LOG',
  WORKFLOW_ACTION_SUCCEEDED: 'TECHNICAL_LOG',
  WORKFLOW_ACTION_RETRY: 'TECHNICAL_LOG',
  WORKFLOW_ERROR: 'TECHNICAL_LOG',
  WORKFLOW_APPROVAL_REQUESTED: 'GOVERNANCE_AUDIT',
  WORKFLOW_APPROVAL_APPROVED: 'GOVERNANCE_AUDIT',
  WORKFLOW_APPROVAL_REJECTED: 'GOVERNANCE_AUDIT',
  WORKFLOW_APPROVAL_EXPIRED: 'GOVERNANCE_AUDIT',
  WORKFLOW_RUN_ABORTED: 'TECHNICAL_LOG',
  WORKFLOW_DEAD_LETTER: 'GOVERNANCE_AUDIT',
  WORKFLOW_REPLAY: 'GOVERNANCE_AUDIT',
  WORKFLOW_POLICY_BLOCKED: 'GOVERNANCE_AUDIT',
  WORKFLOW_RECIPIENT_RESOLVED: 'TECHNICAL_LOG',
  WORKFLOW_PROVIDER_STATUS: 'TECHNICAL_LOG',
};

export const WORKFLOW_AI_ACTION_TYPES = new Set([
  'ai.suggest_action',
  'ai_suggest',
  'ai_execute',
  'ai_send_message',
  'ai_book_appointment',
  'voice.call.start',
  'whatsapp.ai_message.send',
]);

export const WORKFLOW_AI_MODEL_ID = 'synqdrive-workflow-ai-v1';
export const WORKFLOW_AI_PROMPT_VERSION = '2026-07-workflow-automation';

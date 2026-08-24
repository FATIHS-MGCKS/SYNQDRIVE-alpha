import { CommunicationConversationStatus, CommunicationReplySendState } from '@prisma/client';

/**
 * Communication Center data retention classes (C13.1).
 *
 * Policy authority is documented in architecture/COMMUNICATION_CENTER_C13_1_RETENTION_DATA_LIFECYCLE.md.
 * Days of `0` mean destructive purge is disabled (NO_POLICY / UNDECIDED).
 */
export const COMMUNICATION_RETENTION_DATA_CLASS = {
  MESSAGE_CONTENT: 'MESSAGE_CONTENT',
  NATIVE_WHATSAPP_CONTENT: 'NATIVE_WHATSAPP_CONTENT',
  VOICE_TRANSCRIPT: 'VOICE_TRANSCRIPT',
  VOICE_SUMMARY: 'VOICE_SUMMARY',
  VOICE_PROVIDER_PAYLOAD: 'VOICE_PROVIDER_PAYLOAD',
  ATTACHMENT_BINARY: 'ATTACHMENT_BINARY',
  REPLY_COMMAND_CONTENT: 'REPLY_COMMAND_CONTENT',
  AI_ACTIVITY_METADATA: 'AI_ACTIVITY_METADATA',
  STRUCTURAL_RECORD: 'STRUCTURAL_RECORD',
} as const;

export type CommunicationRetentionDataClass =
  (typeof COMMUNICATION_RETENTION_DATA_CLASS)[keyof typeof COMMUNICATION_RETENTION_DATA_CLASS];

export const COMMUNICATION_RETENTION_POLICY_SOURCE = {
  EXISTING_POLICY: 'EXISTING_POLICY',
  LEGAL_POLICY: 'LEGAL_POLICY',
  PRODUCT_POLICY: 'PRODUCT_POLICY',
  NO_POLICY: 'NO_POLICY',
} as const;

export type CommunicationRetentionPolicySource =
  (typeof COMMUNICATION_RETENTION_POLICY_SOURCE)[keyof typeof COMMUNICATION_RETENTION_POLICY_SOURCE];

/** Voice defaults mirror VoiceRetentionService (EXISTING_POLICY). */
export const COMMUNICATION_RETENTION_VOICE_DEFAULTS = {
  transcriptDays: 90,
  summaryDays: 90,
  providerPayloadDays: 30,
} as const;

/**
 * Centralized default retention windows (days). `0` = destructive purge disabled.
 * Message/attachment/reply-command defaults are NO_POLICY until product configures env.
 */
export const COMMUNICATION_RETENTION_DAYS_DEFAULTS = {
  messageContent: 0,
  attachment: 0,
  replyCommandSettled: 0,
  aiContent: 0,
  structuralRecord: 0,
} as const;

export const COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY = 'communication:retention:global';
export const COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS = 30 * 60 * 1000;
export const COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS = Math.floor(
  COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS / 3,
);

/** Bounded page size multiplier for legacy-native candidate scans (per DB round-trip). */
export const COMMUNICATION_RETENTION_LEGACY_NATIVE_PAGE_MULTIPLIER = 5;

export const COMMUNICATION_RETENTION_PURGE_RUN_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
  SKIPPED: 'SKIPPED',
} as const;

export const COMMUNICATION_RETENTION_RUN_SKIP_REASON = {
  LOCK_CONTENTED: 'lock_contended',
  IN_PROCESS_GUARD: 'in_process_guard',
  DISABLED: 'disabled',
} as const;

export const COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE = {
  RUN_FAILED: 'RETENTION_RUN_FAILED',
  LOCK_LOST: 'RETENTION_LOCK_LOST',
} as const;

export const COMMUNICATION_RETENTION_SKIP_REASON = {
  ACTIVE_CONVERSATION: 'active_conversation',
  UNKNOWN_SEND_STATE: 'unknown_send_state',
  PENDING_SEND_STATE: 'pending_send_state',
  POLICY_DISABLED: 'policy_disabled',
  NOT_ELIGIBLE: 'not_eligible',
  LEGAL_HOLD: 'legal_hold',
  DRY_RUN: 'dry_run',
  STORAGE_DELETE_FAILED: 'storage_delete_failed',
  LOCK_CONTENTED: 'lock_contended',
} as const;

export type CommunicationRetentionSkipReason =
  (typeof COMMUNICATION_RETENTION_SKIP_REASON)[keyof typeof COMMUNICATION_RETENTION_SKIP_REASON];

/** Canonical active statuses — content purge must not make active work unreadable. */
export const COMMUNICATION_ACTIVE_CONVERSATION_STATUSES: CommunicationConversationStatus[] = [
  CommunicationConversationStatus.AI_ACTIVE,
  CommunicationConversationStatus.WAITING_CUSTOMER,
  CommunicationConversationStatus.HUMAN_REQUIRED,
  CommunicationConversationStatus.HUMAN_ACTIVE,
];

export const COMMUNICATION_REPLY_COMMAND_PROTECTED_STATES: CommunicationReplySendState[] = [
  CommunicationReplySendState.UNKNOWN,
  CommunicationReplySendState.PENDING,
];

export const COMMUNICATION_RETENTION_PURGED_PREVIEW = '[content removed]';

export const COMMUNICATION_RETENTION_PHASE = {
  VOICE_DELEGATED: 'voice_delegated',
  MESSAGE_CONTENT: 'message_content',
  LEGACY_NATIVE_WHATSAPP_CONTENT: 'legacy_native_whatsapp_content',
  ATTACHMENT_BINARY: 'attachment_binary',
  REPLY_COMMAND_CONTENT: 'reply_command_content',
} as const;

export type CommunicationRetentionPhase =
  (typeof COMMUNICATION_RETENTION_PHASE)[keyof typeof COMMUNICATION_RETENTION_PHASE];

export function computeRetentionCutoffUtc(now: Date, retentionDays: number): Date | null {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isRetentionPolicyEnabled(retentionDays: number): boolean {
  return Number.isFinite(retentionDays) && retentionDays > 0;
}

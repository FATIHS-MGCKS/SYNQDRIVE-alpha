import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

/** Canonical Communication Center permission module. */
export const COMMUNICATION_PERMISSION_MODULE = 'communication' as const;

/** Deep Voice Agent / telephony administration module (separate from operational comms). */
export const VOICE_ASSISTANT_PERMISSION_MODULE = 'voice-assistant' as const;

/** Legacy internal fleet AI module — must not grant Communication Center access after bridge removal. */
export const INTERNAL_AI_ASSISTANT_MODULE = 'ai-assistant' as const;

/**
 * Legacy compatibility bridge for WhatsApp (ai-assistant) and Voice (org-staff operational access).
 * Remove in Phase C13 after Communication Center parity and permission migration complete.
 */
export const COMMUNICATION_LEGACY_BRIDGE_REMOVAL_PHASE = 'C13' as const;

export const COMMUNICATION_LEGACY_BRIDGE_ENABLED = true;

/** Staff membership roles that historically had Voice tenant API access via org membership only. */
export const VOICE_OPERATIONAL_STAFF_ROLES = [
  'ORG_ADMIN',
  'SUB_ADMIN',
  'WORKER',
] as const;

export type VoiceOperationalStaffRole = (typeof VOICE_OPERATIONAL_STAFF_ROLES)[number];

/** Roles excluded from Communication Center operator surfaces. */
export const COMMUNICATION_OPERATOR_EXCLUDED_ROLES = ['DRIVER'] as const;

export interface CommunicationCompatContext {
  /** When true, apply org-staff Voice operational legacy bridge (not manage). */
  voiceOperationalLegacy?: boolean;
}

export interface VoiceAssistantCompatContext {
  /** When true, SUB_ADMIN retains deep admin routes during legacy window. */
  voiceAdminLegacy?: boolean;
}

export const COMMUNICATION_PERMISSION_LEVELS: PermissionLevel[] = [
  'read',
  'write',
  'manage',
];

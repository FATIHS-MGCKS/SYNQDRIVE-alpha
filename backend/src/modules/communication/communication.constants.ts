/**
 * Bounded agent reference types for CommunicationConversation.assignedAgentType.
 * No global AI entity FK — opaque refs only until a unified agent registry exists.
 */
export const COMMUNICATION_AGENT_REFERENCE_TYPES = [
  'WHATSAPP_AI',
  'VOICE_ASSISTANT',
  'ORGANIZATION_CHAT',
  'SMS_AGENT',
  'EXTERNAL',
] as const;

export type CommunicationAgentReferenceType =
  (typeof COMMUNICATION_AGENT_REFERENCE_TYPES)[number];

/** C3+ projection writes should remain feature-gated at runtime; schema is always present. */
export const COMMUNICATION_PROJECTION_RUNTIME_FLAG = 'COMMUNICATION_CENTER_PROJECTION_ENABLED';

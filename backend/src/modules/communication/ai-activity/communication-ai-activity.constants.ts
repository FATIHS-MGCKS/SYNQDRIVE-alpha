import { CommunicationEventType } from '@prisma/client';

/** Canonical communication events surfaced in AI Activity (read projection). */
export const COMMUNICATION_AI_ACTIVITY_EVENT_TYPES: CommunicationEventType[] = [
  CommunicationEventType.AI_INTENT_DETECTED,
  CommunicationEventType.AI_ACTION_STARTED,
  CommunicationEventType.AI_ACTION_COMPLETED,
  CommunicationEventType.AI_ACTION_FAILED,
  CommunicationEventType.HUMAN_REQUIRED,
  CommunicationEventType.HUMAN_ASSIGNED,
  CommunicationEventType.HUMAN_TAKEOVER,
];

export const COMMUNICATION_AI_ACTIVITY_DEFAULT_LIMIT = 40;
export const COMMUNICATION_AI_ACTIVITY_MAX_LIMIT = 50;
export const COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION = 'ai-activity-v1' as const;

export type CommunicationAiActivityFilterCategory =
  | 'all'
  | 'handoffs'
  | 'tools'
  | 'errors';

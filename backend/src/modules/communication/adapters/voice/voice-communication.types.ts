import type {
  VoiceConversation,
  VoiceConversationDirection,
  VoiceToolExecution,
} from '@prisma/client';

export interface TwilioVoiceProjectionSource {
  conversation: VoiceConversation;
  providerEventId: string;
  occurredAt: Date;
  telephonyStatusCode?: string | null;
  durationSeconds?: number | null;
  failureCode?: string | null;
  outcomeCode?: string | null;
  includeInitialStatus?: boolean;
}

export interface ElevenLabsVoiceProjectionSource {
  conversation: VoiceConversation;
  providerEventId: string;
  occurredAt: Date;
  intentCode?: string | null;
  toolName?: string | null;
  actionName?: string | null;
  failureCode?: string | null;
  outcomeCode?: string | null;
  durationSeconds?: number | null;
  includeInitialStatus?: boolean;
}

export interface VoiceHumanRequiredProjectionSource {
  conversation: VoiceConversation;
  providerEventId: string;
  occurredAt: Date;
  handoffReasonCode?: string | null;
  providerIdentity: 'ELEVENLABS' | 'TWILIO' | 'INTERNAL';
}

export interface VoiceToolExecutionProjectionSource {
  conversation: VoiceConversation;
  execution: VoiceToolExecution;
  occurredAt: Date;
}

export type VoiceCallDirection = VoiceConversationDirection;

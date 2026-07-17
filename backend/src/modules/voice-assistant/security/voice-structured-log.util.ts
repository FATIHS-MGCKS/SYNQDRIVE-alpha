import { maskCallerNumber } from '@modules/voice-assistant/voice-conversation.util';

export type VoiceLogContext = {
  event: string;
  correlationId?: string;
  requestId?: string;
  organizationId?: string;
  voiceConversationId?: string;
  twilioCallSid?: string;
  provider?: string;
  errorClass?: string;
  outcome?: string;
  stage?: string;
  detail?: string;
};

function maskConversationId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.length <= 8) return '[masked]';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function maskCallSid(sid: string | undefined): string | undefined {
  if (!sid) return undefined;
  if (sid.length <= 10) return '[masked]';
  return `${sid.slice(0, 4)}…${sid.slice(-4)}`;
}

/**
 * Structured voice log payload — never includes transcripts, raw phone numbers, or secrets.
 */
export function buildVoiceLogPayload(context: VoiceLogContext): Record<string, unknown> {
  return {
    component: 'voice',
    event: context.event,
    correlationId: context.correlationId,
    requestId: context.requestId,
    organizationId: context.organizationId,
    voiceConversationId: maskConversationId(context.voiceConversationId),
    twilioCallSid: maskCallSid(context.twilioCallSid),
    provider: context.provider,
    errorClass: context.errorClass,
    outcome: context.outcome,
    stage: context.stage,
    detail: context.detail,
    ts: new Date().toISOString(),
  };
}

export function redactVoiceLogString(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes('@')) return '[redacted:email]';
  if (/^\+?\d{6,}$/.test(value.replace(/\s/g, ''))) {
    return maskCallerNumber(value) ?? '[redacted:phone]';
  }
  if (value.length > 200) return `[redacted:${value.length}chars]`;
  return value;
}

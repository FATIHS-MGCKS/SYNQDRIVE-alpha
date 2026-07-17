import {
  Prisma,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import { hasConversationTranscript } from './voice-conversation.util';

export const LEGACY_TWIML_SAY_MODE = 'LEGACY_TWIML_SAY' as const;

export function buildLegacyTwimlMetadata(
  extra?: Record<string, unknown>,
): Prisma.InputJsonValue {
  return {
    telephonyMode: LEGACY_TWIML_SAY_MODE,
    runtimePath: 'twilio_say_diagnostic',
    pstnProvider: 'twilio',
    aiProvider: null,
    diagnostic: true,
    productiveAiCall: false,
    ...extra,
  } as Prisma.InputJsonValue;
}

export function buildElevenLabsConversationMetadata(
  extra?: Record<string, unknown>,
): Prisma.InputJsonValue {
  return {
    telephonyMode: 'ELEVENLABS_CONVAI',
    aiProvider: 'elevenlabs',
    productiveAiCall: true,
    diagnostic: false,
    ...extra,
  } as Prisma.InputJsonValue;
}

export function readConversationMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

export function isLegacyTwimlConversation(metadata: unknown): boolean {
  const record = readConversationMetadata(metadata);
  return (
    record.telephonyMode === LEGACY_TWIML_SAY_MODE ||
    record.runtimePath === 'twilio_say_diagnostic' ||
    record.productiveAiCall === false
  );
}

export function isForbiddenStatusOutcomePair(
  status: VoiceConversationStatus,
  outcome: VoiceConversationOutcome,
): boolean {
  return (
    status === VoiceConversationStatus.ACTIVE &&
    outcome === VoiceConversationOutcome.RESOLVED
  );
}

export function assertValidStatusOutcomePair(
  status: VoiceConversationStatus,
  outcome: VoiceConversationOutcome,
): void {
  if (isForbiddenStatusOutcomePair(status, outcome)) {
    throw new Error(`Invalid conversation lifecycle: ${status} cannot pair with ${outcome}`);
  }
}

export function isPendingOutcome(outcome: VoiceConversationOutcome): boolean {
  return outcome === VoiceConversationOutcome.PENDING;
}

export function isAnalyticsAnsweredConversation(conv: {
  outcome: VoiceConversationOutcome;
  status: VoiceConversationStatus;
  durationSeconds: number | null;
  metadata: unknown;
  transcript?: string | null;
}): boolean {
  if (isLegacyTwimlConversation(conv.metadata)) return false;
  if (isPendingOutcome(conv.outcome)) return false;
  if (conv.outcome === VoiceConversationOutcome.ESCALATED) return true;
  if (conv.outcome === VoiceConversationOutcome.RESOLVED) {
    return hasConversationTranscript(conv.transcript ?? null);
  }
  if (conv.durationSeconds != null && conv.durationSeconds > 0) {
    return false;
  }
  return false;
}

export function isAnalyticsMissedConversation(conv: {
  outcome: VoiceConversationOutcome;
  metadata: unknown;
}): boolean {
  if (isLegacyTwimlConversation(conv.metadata)) {
    return (
      conv.outcome === VoiceConversationOutcome.ABANDONED ||
      conv.outcome === VoiceConversationOutcome.FAILED
    );
  }
  return (
    conv.outcome === VoiceConversationOutcome.ABANDONED ||
    conv.outcome === VoiceConversationOutcome.FAILED
  );
}

export function resolveLegacyTwimlTerminalOutcome(callStatus: string): VoiceConversationOutcome {
  const status = callStatus.toLowerCase();
  if (status === 'completed') {
    return VoiceConversationOutcome.ABANDONED;
  }
  if (status === 'no-answer' || status === 'busy') {
    return VoiceConversationOutcome.ABANDONED;
  }
  if (status === 'failed' || status === 'canceled') {
    return VoiceConversationOutcome.FAILED;
  }
  return VoiceConversationOutcome.PENDING;
}

export function resolveElevenLabsSyncOutcome(params: {
  remoteStatus: string;
  transcript: string | null;
}): VoiceConversationOutcome {
  if (params.remoteStatus !== 'done') {
    return VoiceConversationOutcome.FAILED;
  }
  if (hasConversationTranscript(params.transcript)) {
    return VoiceConversationOutcome.RESOLVED;
  }
  return VoiceConversationOutcome.ABANDONED;
}

export function hasCountersApplied(metadata: unknown): boolean {
  return readConversationMetadata(metadata).countersApplied === true;
}

export function withCountersApplied(metadata: unknown): Prisma.InputJsonValue {
  return {
    ...readConversationMetadata(metadata),
    countersApplied: true,
  } as Prisma.InputJsonValue;
}

export function preferDurationSeconds(
  current: number | null | undefined,
  incoming: number | null | undefined,
  source: 'twilio' | 'elevenlabs',
): number | null {
  if (incoming == null || !Number.isFinite(incoming) || incoming <= 0) {
    return current ?? null;
  }
  if (current == null || current <= 0) {
    return incoming;
  }
  if (source === 'twilio') {
    return incoming;
  }
  return current;
}

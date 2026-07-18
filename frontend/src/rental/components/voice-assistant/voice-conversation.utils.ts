import type { VoiceAssistantData, VoiceConversationEntry, VoiceConversationOutcome } from '../../../lib/api';

export function maskCallerNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  if (raw.includes('***')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  const visible = digits.slice(-4);
  const prefix = raw.trim().startsWith('+') ? '+' : '';
  return `${prefix}*** *** ${visible}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function outcomeBadgeTone(
  outcome: VoiceConversationOutcome,
): 'success' | 'warning' | 'critical' | 'neutral' {
  switch (outcome) {
    case 'RESOLVED':
      return 'success';
    case 'ESCALATED':
      return 'warning';
    case 'PENDING':
      return 'neutral';
    case 'FAILED':
    case 'ABANDONED':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function isInbound(direction: VoiceConversationEntry['direction']): boolean {
  return String(direction).toLowerCase() === 'inbound';
}

export const OUTCOME_OPTIONS: VoiceConversationOutcome[] = [
  'PENDING',
  'RESOLVED',
  'ESCALATED',
  'FAILED',
  'ABANDONED',
];

export function isLegacyDiagnosticConversation(conversation: VoiceConversationEntry): boolean {
  const meta = conversation.metadata;
  if (!meta || typeof meta !== 'object') return false;
  const record = meta as Record<string, unknown>;
  return (
    record.telephonyMode === 'LEGACY_TWIML_SAY' ||
    record.runtimePath === 'twilio_say_diagnostic' ||
    record.productiveAiCall === false ||
    record.diagnostic === true
  );
}

export function isFinalizedConversation(conversation: VoiceConversationEntry): boolean {
  if (isLegacyDiagnosticConversation(conversation)) return false;
  const status = String(conversation.status ?? '').toLowerCase();
  if (status === 'active') return false;
  if (conversation.outcome === 'PENDING') return false;
  return true;
}

export function conversationIntent(conversation: VoiceConversationEntry): string | null {
  const summary = conversation.summary?.trim();
  if (summary) {
    const firstSentence = summary.split(/[.!?]/)[0]?.trim();
    if (firstSentence) return firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}…` : firstSentence;
  }
  const meta = conversation.metadata;
  if (meta && typeof meta === 'object') {
    const intent = (meta as Record<string, unknown>).intent;
    if (typeof intent === 'string' && intent.trim()) return intent.trim();
  }
  return null;
}

export type VoicePrivacyStatus = 'full' | 'summary_only' | 'no_recording' | 'pending';

export function resolvePrivacyStatus(
  conversation: VoiceConversationEntry,
  assistant?: VoiceAssistantData | null,
): VoicePrivacyStatus {
  if (!isFinalizedConversation(conversation)) return 'pending';
  if (isLegacyDiagnosticConversation(conversation)) return 'no_recording';
  if (conversation.hasTranscript) return 'full';
  if (conversation.summary?.trim()) return 'summary_only';
  const recordAudio = readAssistantRecordAudio(assistant);
  if (!recordAudio) return 'no_recording';
  return 'summary_only';
}

function readAssistantRecordAudio(assistant?: VoiceAssistantData | null): boolean {
  const hours = assistant?.businessHours;
  if (hours && typeof hours === 'object' && !Array.isArray(hours)) {
    const privacy = (hours as Record<string, unknown>).privacyRetention;
    if (privacy && typeof privacy === 'object' && !Array.isArray(privacy)) {
      return (privacy as Record<string, unknown>).recordAudio === true;
    }
  }
  return false;
}

export function canPlayCallAudio(
  conversation: VoiceConversationEntry,
  assistant?: VoiceAssistantData | null,
): boolean {
  return resolvePrivacyStatus(conversation, assistant) === 'full' && readAssistantRecordAudio(assistant);
}

export function estimatedCallCostCents(
  conversation: VoiceConversationEntry,
  centsPerMinute = 0,
): number | null {
  if (!isFinalizedConversation(conversation)) return null;
  const seconds = conversation.durationSeconds;
  if (seconds == null || seconds <= 0) return centsPerMinute > 0 ? 0 : null;
  if (centsPerMinute <= 0) return null;
  return Math.round((seconds / 60) * centsPerMinute);
}

export type VoiceFollowUpKind = 'task' | 'escalation' | 'callback' | 'none' | 'review';

export function resolveFollowUpKind(conversation: VoiceConversationEntry): VoiceFollowUpKind {
  if (conversation.taskId) return 'task';
  if (conversation.escalated || conversation.outcome === 'ESCALATED') {
    const reason = conversation.escalationReason?.toLowerCase() ?? '';
    if (reason.includes('callback') || reason.includes('rückruf')) return 'callback';
    return 'escalation';
  }
  if (!isFinalizedConversation(conversation)) return 'review';
  if (conversation.outcome === 'FAILED' || conversation.errorMessage) return 'review';
  return 'none';
}

export function shortEntityRef(id: string | null | undefined): string {
  if (!id?.trim()) return '—';
  if (id.length <= 8) return id;
  return `…${id.slice(-6)}`;
}

export interface ConversationTimelineEvent {
  id: string;
  at: string;
  kind: 'started' | 'ended' | 'escalated' | 'tool' | 'error';
  label: string;
  detail?: string;
}

export function buildConversationTimeline(
  conversation: VoiceConversationEntry,
): ConversationTimelineEvent[] {
  const events: ConversationTimelineEvent[] = [
    {
      id: 'started',
      at: conversation.startedAt,
      kind: 'started',
      label: 'started',
    },
  ];

  if (conversation.escalated || conversation.outcome === 'ESCALATED') {
    events.push({
      id: 'escalated',
      at: conversation.endedAt ?? conversation.startedAt,
      kind: 'escalated',
      label: 'escalated',
      detail: conversation.escalationReason ?? undefined,
    });
  }

  for (const [index, action] of (conversation.actionsPerformed ?? []).entries()) {
    events.push({
      id: `tool-${index}`,
      at: conversation.endedAt ?? conversation.startedAt,
      kind: 'tool',
      label: action,
    });
  }

  if (conversation.errorMessage) {
    events.push({
      id: 'error',
      at: conversation.endedAt ?? conversation.startedAt,
      kind: 'error',
      label: 'error',
      detail: conversation.errorMessage,
    });
  }

  if (conversation.endedAt) {
    events.push({
      id: 'ended',
      at: conversation.endedAt,
      kind: 'ended',
      label: 'ended',
    });
  }

  return events;
}

export function providerStatusForConversation(conversation: VoiceConversationEntry): string {
  if (!isFinalizedConversation(conversation)) return 'pending';
  if (conversation.errorMessage) return 'error';
  if (isLegacyDiagnosticConversation(conversation)) return 'diagnostic';
  return 'finalized';
}

export function customerDisplayLabel(conversation: VoiceConversationEntry): 'unknown' | 'linked' | 'masked' {
  if (conversation.linkedCustomerId) return 'linked';
  if (conversation.callerNumber) return 'masked';
  return 'unknown';
}

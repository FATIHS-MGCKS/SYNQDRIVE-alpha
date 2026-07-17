import type { VoiceConversationEntry, VoiceConversationOutcome } from '../../../lib/api';

export function maskCallerNumber(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Unknown caller';
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

export function directionLabel(direction: VoiceConversationEntry['direction']): string {
  const normalized = String(direction).toLowerCase();
  return normalized === 'outbound' ? 'Outbound' : 'Inbound';
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

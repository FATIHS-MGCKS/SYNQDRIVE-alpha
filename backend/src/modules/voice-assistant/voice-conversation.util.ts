import type { Prisma } from '@prisma/client';
import {
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import { isLegacyTwimlConversation, readConversationMetadata } from './voice-conversation-lifecycle.util';

export interface ConversationLinkIds {
  linkedBookingId: string | null;
  linkedCustomerId: string | null;
  linkedVehicleId: string | null;
  taskId: string | null;
}

const LINK_KEYS = [
  'linkedBookingId',
  'linkedCustomerId',
  'linkedVehicleId',
  'taskId',
] as const;

const SAFE_METADATA_KEYS = [
  'provider',
  'channel',
  'language',
  'trainingExample',
  'telephonyMode',
  'runtimePath',
  'diagnostic',
  'productiveAiCall',
  'pstnProvider',
] as const;

export function maskCallerNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  const visible = digits.slice(-4);
  const prefix = raw.trim().startsWith('+') ? '+' : '';
  return `${prefix}*** *** ${visible}`;
}

export function extractConversationLinks(metadata: unknown): ConversationLinkIds {
  const empty: ConversationLinkIds = {
    linkedBookingId: null,
    linkedCustomerId: null,
    linkedVehicleId: null,
    taskId: null,
  };
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return empty;

  const record = metadata as Record<string, unknown>;
  const readId = (key: (typeof LINK_KEYS)[number]): string | null => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  return {
    linkedBookingId: readId('linkedBookingId'),
    linkedCustomerId: readId('linkedCustomerId'),
    linkedVehicleId: readId('linkedVehicleId'),
    taskId: readId('taskId'),
  };
}

export function minimalConversationMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_METADATA_KEYS) {
    if (record[key] !== undefined) safe[key] = record[key];
  }
  if (isLegacyTwimlConversation(record)) {
    safe.diagnostic = true;
    safe.productiveAiCall = false;
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

export function isConversationEscalated(conv: {
  outcome: VoiceConversationOutcome;
  escalationReason: string | null;
}): boolean {
  return conv.outcome === VoiceConversationOutcome.ESCALATED || Boolean(conv.escalationReason?.trim());
}

export function hasConversationTranscript(transcript: string | null | undefined): boolean {
  return Boolean(transcript?.trim());
}

export function buildConversationWhere(
  organizationId: string,
  query: {
    outcome?: VoiceConversationOutcome;
    direction?: VoiceConversationDirection;
    status?: VoiceConversationStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    escalatedOnly?: boolean;
    hasTranscript?: boolean;
  },
): Prisma.VoiceConversationWhereInput {
  const and: Prisma.VoiceConversationWhereInput[] = [{ organizationId }];

  if (query.outcome) and.push({ outcome: query.outcome });
  if (query.direction) and.push({ direction: query.direction });
  if (query.status) and.push({ status: query.status });

  if (query.dateFrom || query.dateTo) {
    const startedAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) startedAt.gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const end = new Date(query.dateTo);
      end.setHours(23, 59, 59, 999);
      startedAt.lte = end;
    }
    and.push({ startedAt });
  }

  if (query.escalatedOnly) {
    and.push({
      OR: [
        { outcome: VoiceConversationOutcome.ESCALATED },
        { escalationReason: { not: null } },
      ],
    });
  }

  if (query.hasTranscript === true) {
    and.push({ transcript: { not: null } }, { NOT: { transcript: '' } });
  } else if (query.hasTranscript === false) {
    and.push({ OR: [{ transcript: null }, { transcript: '' }] });
  }

  const term = query.search?.trim();
  if (term) {
    and.push({
      OR: [
        { summary: { contains: term, mode: 'insensitive' } },
        { transcript: { contains: term, mode: 'insensitive' } },
        { callerNumber: { contains: term, mode: 'insensitive' } },
        { escalationReason: { contains: term, mode: 'insensitive' } },
      ],
    });
  }

  return and.length === 1 ? and[0] : { AND: and };
}

export function sanitizeWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const sanitized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'x-api-key') {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

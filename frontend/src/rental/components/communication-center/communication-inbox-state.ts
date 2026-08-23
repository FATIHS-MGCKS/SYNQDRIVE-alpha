import type { CommunicationApiStatus } from '../../../lib/communication/types';
import type { CommunicationChannel } from './communication-center.types';

export type CommunicationAssignmentFilter = 'all' | 'unassigned';

export type CommunicationStatusFilter = 'all' | CommunicationApiStatus;

export type CommunicationIntentFilter =
  | 'all'
  | 'ai_suggested'
  | 'unknown_customer'
  | 'booking'
  | 'documents'
  | 'payment'
  | 'damage';

export type CommunicationVoiceDirectionFilter = 'all' | 'INBOUND' | 'OUTBOUND';

export type CommunicationVoiceOutcomeFilter =
  | 'all'
  | 'PENDING'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'FAILED'
  | 'ABANDONED';

export type CommunicationVoiceCallFilter = 'all' | 'escalated' | 'hasTranscript';

export interface CommunicationInboxFilters {
  search: string;
  unreadOnly: boolean;
  status: CommunicationStatusFilter;
  assignment: CommunicationAssignmentFilter;
  intent: CommunicationIntentFilter;
  voiceDirection: CommunicationVoiceDirectionFilter;
  voiceOutcome: CommunicationVoiceOutcomeFilter;
  voiceCallFilter: CommunicationVoiceCallFilter;
  voiceDateFrom: string;
  voiceDateTo: string;
}

export const COMMUNICATION_SEARCH_MAX_LENGTH = 120;

export const DEFAULT_COMMUNICATION_INBOX_FILTERS: CommunicationInboxFilters = {
  search: '',
  unreadOnly: false,
  status: 'all',
  assignment: 'all',
  intent: 'all',
  voiceDirection: 'all',
  voiceOutcome: 'all',
  voiceCallFilter: 'all',
  voiceDateFrom: '',
  voiceDateTo: '',
};

export function clampCommunicationSearchDraft(value: string): string {
  return value.slice(0, COMMUNICATION_SEARCH_MAX_LENGTH);
}

export function normalizeCommunicationSearch(value: string): string {
  return clampCommunicationSearchDraft(value.trim());
}

const STATUS_VALUES = new Set<string>([
  'AI_ACTIVE',
  'WAITING_CUSTOMER',
  'HUMAN_REQUIRED',
  'HUMAN_ACTIVE',
  'RESOLVED',
  'FAILED',
]);

const ASSIGNMENT_VALUES = new Set<string>(['all', 'unassigned']);

const INTENT_VALUES = new Set<string>([
  'all',
  'ai_suggested',
  'unknown_customer',
  'booking',
  'documents',
  'payment',
  'damage',
]);

export const COMMUNICATION_SEARCH_PARAM = 'communicationSearch';
export const COMMUNICATION_UNREAD_PARAM = 'communicationUnread';
export const COMMUNICATION_STATUS_PARAM = 'communicationStatus';
export const COMMUNICATION_ASSIGNMENT_PARAM = 'communicationAssignment';
export const COMMUNICATION_INTENT_PARAM = 'communicationIntent';
export const COMMUNICATION_VOICE_DIRECTION_PARAM = 'communicationVoiceDirection';
export const COMMUNICATION_VOICE_OUTCOME_PARAM = 'communicationVoiceOutcome';
export const COMMUNICATION_VOICE_CALL_FILTER_PARAM = 'communicationVoiceCallFilter';
export const COMMUNICATION_VOICE_DATE_FROM_PARAM = 'communicationVoiceDateFrom';
export const COMMUNICATION_VOICE_DATE_TO_PARAM = 'communicationVoiceDateTo';

const VOICE_DIRECTION_VALUES = new Set<string>(['all', 'INBOUND', 'OUTBOUND']);
const VOICE_OUTCOME_VALUES = new Set<string>([
  'all',
  'PENDING',
  'RESOLVED',
  'ESCALATED',
  'FAILED',
  'ABANDONED',
]);
const VOICE_CALL_FILTER_VALUES = new Set<string>(['all', 'escalated', 'hasTranscript']);

export function readCommunicationInboxFiltersFromUrl(
  search = '',
): Partial<CommunicationInboxFilters> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const next: Partial<CommunicationInboxFilters> = {};

  const searchTerm = params.get(COMMUNICATION_SEARCH_PARAM);
  if (searchTerm) next.search = normalizeCommunicationSearch(searchTerm);

  const unread = params.get(COMMUNICATION_UNREAD_PARAM);
  if (unread === 'true') next.unreadOnly = true;

  const status = params.get(COMMUNICATION_STATUS_PARAM);
  if (status && STATUS_VALUES.has(status)) {
    next.status = status as CommunicationApiStatus;
  }

  const assignment = params.get(COMMUNICATION_ASSIGNMENT_PARAM);
  if (assignment && ASSIGNMENT_VALUES.has(assignment)) {
    next.assignment = assignment as CommunicationAssignmentFilter;
  }

  const intent = params.get(COMMUNICATION_INTENT_PARAM);
  if (intent && INTENT_VALUES.has(intent)) {
    next.intent = intent as CommunicationIntentFilter;
  }

  const voiceDirection = params.get(COMMUNICATION_VOICE_DIRECTION_PARAM);
  if (voiceDirection && VOICE_DIRECTION_VALUES.has(voiceDirection)) {
    next.voiceDirection = voiceDirection as CommunicationVoiceDirectionFilter;
  }

  const voiceOutcome = params.get(COMMUNICATION_VOICE_OUTCOME_PARAM);
  if (voiceOutcome && VOICE_OUTCOME_VALUES.has(voiceOutcome)) {
    next.voiceOutcome = voiceOutcome as CommunicationVoiceOutcomeFilter;
  }

  const voiceCallFilter = params.get(COMMUNICATION_VOICE_CALL_FILTER_PARAM);
  if (voiceCallFilter && VOICE_CALL_FILTER_VALUES.has(voiceCallFilter)) {
    next.voiceCallFilter = voiceCallFilter as CommunicationVoiceCallFilter;
  }

  const voiceDateFrom = params.get(COMMUNICATION_VOICE_DATE_FROM_PARAM);
  if (voiceDateFrom) next.voiceDateFrom = voiceDateFrom;

  const voiceDateTo = params.get(COMMUNICATION_VOICE_DATE_TO_PARAM);
  if (voiceDateTo) next.voiceDateTo = voiceDateTo;

  return next;
}

export function mergeCommunicationInboxFilters(
  partial?: Partial<CommunicationInboxFilters>,
): CommunicationInboxFilters {
  return { ...DEFAULT_COMMUNICATION_INBOX_FILTERS, ...partial };
}

export function hasActiveCommunicationInboxFilters(
  filters: CommunicationInboxFilters,
  channel: CommunicationChannel = 'all',
): boolean {
  return (
    channel !== 'all' ||
    Boolean(filters.search.trim()) ||
    filters.unreadOnly ||
    filters.status !== 'all' ||
    filters.assignment !== 'all' ||
    filters.intent !== 'all' ||
    filters.voiceDirection !== 'all' ||
    filters.voiceOutcome !== 'all' ||
    filters.voiceCallFilter !== 'all' ||
    Boolean(filters.voiceDateFrom) ||
    Boolean(filters.voiceDateTo)
  );
}

export function mapShellChannelToApiChannel(
  channel: CommunicationChannel,
): import('../../../lib/communication/types').CommunicationApiChannel | undefined {
  switch (channel) {
    case 'whatsapp':
      return 'WHATSAPP';
    case 'voice':
      return 'VOICE';
    case 'sms':
      return 'SMS';
    default:
      return undefined;
  }
}

export function buildCommunicationInboxApiQuery(
  channel: CommunicationChannel,
  filters: CommunicationInboxFilters,
): import('../../../lib/communication/types').CommunicationConversationListQuery {
  const apiChannel = mapShellChannelToApiChannel(channel);
  const query: import('../../../lib/communication/types').CommunicationConversationListQuery = {};

  if (apiChannel) query.channel = apiChannel;
  const search = normalizeCommunicationSearch(filters.search);
  if (search) query.search = search;
  if (filters.unreadOnly) query.unreadOnly = true;
  if (filters.status !== 'all') query.status = filters.status;
  if (filters.assignment === 'unassigned') query.unassigned = true;
  if (filters.intent !== 'all') query.intent = filters.intent;

  if (channel === 'voice') {
    if (filters.voiceDirection !== 'all') query.callDirection = filters.voiceDirection;
    if (filters.voiceOutcome !== 'all') query.callOutcome = filters.voiceOutcome;
    if (filters.voiceCallFilter === 'escalated') query.callEscalatedOnly = true;
    if (filters.voiceCallFilter === 'hasTranscript') query.callHasTranscript = true;
    if (filters.voiceDateFrom) {
      query.dateFrom = `${filters.voiceDateFrom}T00:00:00.000Z`;
    }
    if (filters.voiceDateTo) {
      query.dateTo = `${filters.voiceDateTo}T23:59:59.999Z`;
    }
  }

  return query;
}

export function applyCommunicationInboxFiltersToSearchParams(
  params: URLSearchParams,
  filters: CommunicationInboxFilters,
): void {
  const entries: Array<[string, string | null]> = [
    [COMMUNICATION_SEARCH_PARAM, normalizeCommunicationSearch(filters.search) || null],
    [COMMUNICATION_UNREAD_PARAM, filters.unreadOnly ? 'true' : null],
    [COMMUNICATION_STATUS_PARAM, filters.status !== 'all' ? filters.status : null],
    [COMMUNICATION_ASSIGNMENT_PARAM, filters.assignment !== 'all' ? filters.assignment : null],
    [COMMUNICATION_INTENT_PARAM, filters.intent !== 'all' ? filters.intent : null],
    [
      COMMUNICATION_VOICE_DIRECTION_PARAM,
      filters.voiceDirection !== 'all' ? filters.voiceDirection : null,
    ],
    [COMMUNICATION_VOICE_OUTCOME_PARAM, filters.voiceOutcome !== 'all' ? filters.voiceOutcome : null],
    [
      COMMUNICATION_VOICE_CALL_FILTER_PARAM,
      filters.voiceCallFilter !== 'all' ? filters.voiceCallFilter : null,
    ],
    [COMMUNICATION_VOICE_DATE_FROM_PARAM, filters.voiceDateFrom || null],
    [COMMUNICATION_VOICE_DATE_TO_PARAM, filters.voiceDateTo || null],
  ];

  for (const [key, value] of entries) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
}

export function syncCommunicationInboxFiltersToUrl(
  filters: CommunicationInboxFilters,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  applyCommunicationInboxFiltersToSearchParams(url.searchParams, filters);

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  if (options?.replace) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
}

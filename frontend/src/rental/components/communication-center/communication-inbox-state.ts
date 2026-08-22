import type { CommunicationApiStatus } from '../../../lib/communication/types';
import type { CommunicationChannel } from './communication-center.types';

export type CommunicationAssignmentFilter = 'all' | 'unassigned';

export type CommunicationStatusFilter = 'all' | CommunicationApiStatus;

export interface CommunicationInboxFilters {
  search: string;
  unreadOnly: boolean;
  status: CommunicationStatusFilter;
  assignment: CommunicationAssignmentFilter;
}

export const COMMUNICATION_SEARCH_MAX_LENGTH = 120;

export const DEFAULT_COMMUNICATION_INBOX_FILTERS: CommunicationInboxFilters = {
  search: '',
  unreadOnly: false,
  status: 'all',
  assignment: 'all',
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

export const COMMUNICATION_SEARCH_PARAM = 'communicationSearch';
export const COMMUNICATION_UNREAD_PARAM = 'communicationUnread';
export const COMMUNICATION_STATUS_PARAM = 'communicationStatus';
export const COMMUNICATION_ASSIGNMENT_PARAM = 'communicationAssignment';

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
    filters.assignment !== 'all'
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

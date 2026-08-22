import type {
  CommunicationChannel,
  CommunicationMobilePane,
  CommunicationPrimaryTab,
} from './communication-center.types';

export const COMMUNICATION_CENTER_VIEW = 'communication-center';

export const COMMUNICATION_VIEW_PARAM = 'view';
export const COMMUNICATION_TAB_PARAM = 'communicationTab';
export const COMMUNICATION_CHANNEL_PARAM = 'communicationChannel';
export const COMMUNICATION_CONVERSATION_PARAM = 'conversationId';
export const COMMUNICATION_MOBILE_PANE_PARAM = 'communicationPane';

const CHANNELS = new Set<string>(['all', 'whatsapp', 'voice', 'sms']);
const MOBILE_PANES = new Set<string>(['inbox', 'conversation', 'context']);

export interface CommunicationCenterUrlState {
  primaryTab: CommunicationPrimaryTab;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
}

export const DEFAULT_COMMUNICATION_CENTER_URL_STATE: CommunicationCenterUrlState = {
  primaryTab: 'inbox',
  channel: 'all',
  selectedConversationId: null,
  mobilePane: 'inbox',
};

function parseSearch(search = ''): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function isCommunicationCenterView(view: string | null | undefined): boolean {
  return view === COMMUNICATION_CENTER_VIEW;
}

export function parseCommunicationCenterViewFromUrl(search = ''): boolean {
  return isCommunicationCenterView(parseSearch(search).get(COMMUNICATION_VIEW_PARAM));
}

/** Settings tab is reserved for C8.4 — normalize to inbox in production shell. */
export function normalizeCommunicationPrimaryTab(
  tab: CommunicationPrimaryTab | string | null | undefined,
): CommunicationPrimaryTab {
  if (tab === 'settings') return 'inbox';
  return tab === 'inbox' ? 'inbox' : 'inbox';
}

export function readCommunicationCenterStateFromUrl(
  search = '',
): Partial<CommunicationCenterUrlState> {
  const params = parseSearch(search);
  const next: Partial<CommunicationCenterUrlState> = {};

  const tab = params.get(COMMUNICATION_TAB_PARAM);
  if (tab) {
    next.primaryTab = normalizeCommunicationPrimaryTab(tab);
  }

  const channel = params.get(COMMUNICATION_CHANNEL_PARAM);
  if (channel && CHANNELS.has(channel)) {
    next.channel = channel as CommunicationChannel;
  }

  const conversationId = params.get(COMMUNICATION_CONVERSATION_PARAM);
  if (conversationId) {
    next.selectedConversationId = conversationId;
  }

  const mobilePane = params.get(COMMUNICATION_MOBILE_PANE_PARAM);
  if (mobilePane && MOBILE_PANES.has(mobilePane)) {
    next.mobilePane = mobilePane as CommunicationMobilePane;
  } else if (conversationId) {
    next.mobilePane = 'conversation';
  }

  return next;
}

export function mergeCommunicationCenterState(
  partial: Partial<CommunicationCenterUrlState> | undefined,
): CommunicationCenterUrlState {
  const merged = {
    ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
    ...partial,
  };
  return {
    ...merged,
    primaryTab: normalizeCommunicationPrimaryTab(merged.primaryTab),
  };
}

export function applyCommunicationChannelChange(
  current: CommunicationCenterUrlState,
  channel: CommunicationChannel,
): CommunicationCenterUrlState {
  if (current.channel === channel) return current;
  return {
    ...current,
    channel,
    selectedConversationId: null,
    mobilePane: 'inbox',
  };
}

export function syncCommunicationCenterStateToUrl(
  state: CommunicationCenterUrlState,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  const normalized = mergeCommunicationCenterState(state);
  const url = new URL(window.location.href);
  url.searchParams.set(COMMUNICATION_VIEW_PARAM, COMMUNICATION_CENTER_VIEW);

  const entries: Array<[string, string | null]> = [
    [COMMUNICATION_TAB_PARAM, null],
    [COMMUNICATION_CHANNEL_PARAM, normalized.channel !== 'all' ? normalized.channel : null],
    [COMMUNICATION_CONVERSATION_PARAM, normalized.selectedConversationId],
    [
      COMMUNICATION_MOBILE_PANE_PARAM,
      normalized.mobilePane !== 'inbox' ? normalized.mobilePane : null,
    ],
  ];

  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  if (options?.replace) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
}

export function clearCommunicationCenterUrlParams(search = ''): string {
  const params = parseSearch(search);
  params.delete(COMMUNICATION_TAB_PARAM);
  params.delete(COMMUNICATION_CHANNEL_PARAM);
  params.delete(COMMUNICATION_CONVERSATION_PARAM);
  params.delete(COMMUNICATION_MOBILE_PANE_PARAM);
  const query = params.toString();
  return query ? `?${query}` : '';
}

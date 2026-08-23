import type {
  CommunicationChannel,
  CommunicationMobilePane,
  CommunicationPrimaryTab,
  CommunicationSettingsSection,
} from './communication-center.types';
import {
  readCommunicationInboxFiltersFromUrl,
  applyCommunicationInboxFiltersToSearchParams,
  type CommunicationInboxFilters,
  mergeCommunicationInboxFilters,
} from './communication-inbox-state';

export type { CommunicationInboxFilters };
export {
  buildCommunicationInboxApiQuery,
  hasActiveCommunicationInboxFilters,
  mergeCommunicationInboxFilters,
  DEFAULT_COMMUNICATION_INBOX_FILTERS,
} from './communication-inbox-state';

export const COMMUNICATION_CENTER_VIEW = 'communication-center';

export const COMMUNICATION_VIEW_PARAM = 'view';
export const COMMUNICATION_TAB_PARAM = 'communicationTab';
export const COMMUNICATION_SETTINGS_PARAM = 'communicationSettings';
export const COMMUNICATION_CHANNEL_PARAM = 'communicationChannel';
export const COMMUNICATION_CONVERSATION_PARAM = 'conversationId';
export const COMMUNICATION_MOBILE_PANE_PARAM = 'communicationPane';

const CHANNELS = new Set<string>(['all', 'whatsapp', 'voice', 'sms']);
const MOBILE_PANES = new Set<string>(['inbox', 'conversation', 'context']);
const SETTINGS_SECTIONS = new Set<string>(['overview', 'whatsapp', 'voice', 'sms']);

export interface CommunicationCenterUrlState {
  primaryTab: CommunicationPrimaryTab;
  settingsSection: CommunicationSettingsSection;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
  inboxFilters: CommunicationInboxFilters;
}

export const DEFAULT_COMMUNICATION_CENTER_URL_STATE: CommunicationCenterUrlState = {
  primaryTab: 'inbox',
  settingsSection: 'overview',
  channel: 'all',
  selectedConversationId: null,
  mobilePane: 'inbox',
  inboxFilters: mergeCommunicationInboxFilters(),
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

export function normalizeCommunicationPrimaryTab(
  tab: CommunicationPrimaryTab | string | null | undefined,
): CommunicationPrimaryTab {
  if (tab === 'settings') return 'settings';
  if (tab === 'ai-activity') return 'ai-activity';
  return 'inbox';
}

export function normalizeCommunicationSettingsSection(
  section: CommunicationSettingsSection | string | null | undefined,
): CommunicationSettingsSection {
  if (section && SETTINGS_SECTIONS.has(section)) {
    return section as CommunicationSettingsSection;
  }
  return 'overview';
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

  const settingsSection = params.get(COMMUNICATION_SETTINGS_PARAM);
  if (settingsSection) {
    next.settingsSection = normalizeCommunicationSettingsSection(settingsSection);
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

  next.inboxFilters = mergeCommunicationInboxFilters(readCommunicationInboxFiltersFromUrl(search));

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
    settingsSection: normalizeCommunicationSettingsSection(merged.settingsSection),
    inboxFilters: mergeCommunicationInboxFilters(merged.inboxFilters),
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

export function applyCommunicationPrimaryTabChange(
  current: CommunicationCenterUrlState,
  primaryTab: CommunicationPrimaryTab,
): CommunicationCenterUrlState {
  if (current.primaryTab === primaryTab) return current;
  return {
    ...current,
    primaryTab,
    settingsSection: primaryTab === 'settings' ? current.settingsSection : 'overview',
  };
}

export function applyCommunicationSettingsSectionChange(
  current: CommunicationCenterUrlState,
  settingsSection: CommunicationSettingsSection,
): CommunicationCenterUrlState {
  const normalized = normalizeCommunicationSettingsSection(settingsSection);
  if (current.settingsSection === normalized && current.primaryTab === 'settings') return current;
  return {
    ...current,
    primaryTab: 'settings',
    settingsSection: normalized,
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
  applyCommunicationInboxFiltersToSearchParams(url.searchParams, normalized.inboxFilters);

  const entries: Array<[string, string | null]> = [
    [COMMUNICATION_TAB_PARAM, normalized.primaryTab === 'inbox' ? null : normalized.primaryTab],
    [
      COMMUNICATION_SETTINGS_PARAM,
      normalized.primaryTab === 'settings' ? normalized.settingsSection : null,
    ],
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
  params.delete(COMMUNICATION_SETTINGS_PARAM);
  params.delete(COMMUNICATION_CHANNEL_PARAM);
  params.delete(COMMUNICATION_CONVERSATION_PARAM);
  params.delete(COMMUNICATION_MOBILE_PANE_PARAM);
  params.delete('communicationSearch');
  params.delete('communicationUnread');
  params.delete('communicationStatus');
  params.delete('communicationAssignment');
  const query = params.toString();
  return query ? `?${query}` : '';
}

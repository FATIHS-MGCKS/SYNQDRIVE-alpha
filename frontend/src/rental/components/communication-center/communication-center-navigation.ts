import type {
  CommunicationChannel,
  CommunicationChannelsSection,
  CommunicationMobilePane,
  CommunicationPrimaryTab,
  CommunicationSettingsSection,
  CommunicationVoiceIntent,
  CommunicationWhatsAppChannelSubview,
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
export const COMMUNICATION_CHANNELS_PARAM = 'communicationChannels';
export const COMMUNICATION_CHANNEL_PARAM = 'communicationChannel';
export const COMMUNICATION_CONVERSATION_PARAM = 'conversationId';
export const COMMUNICATION_MOBILE_PANE_PARAM = 'communicationPane';
export const COMMUNICATION_WHATSAPP_SUBVIEW_PARAM = 'communicationWhatsAppSubview';
export const COMMUNICATION_VOICE_INTENT_PARAM = 'communicationVoiceIntent';

const INBOX_CHANNELS = new Set<string>(['all', 'whatsapp', 'voice', 'sms']);
const MOBILE_PANES = new Set<string>(['inbox', 'conversation', 'context']);
const SETTINGS_SECTIONS = new Set<string>(['overview', 'whatsapp', 'voice', 'sms']);
const CHANNELS_SECTIONS = new Set<string>(['overview', 'whatsapp', 'voice', 'sms', 'email']);
const WHATSAPP_SUBVIEWS = new Set<string>(['overview', 'configuration', 'templates']);
const VOICE_INTENTS = new Set<string>([
  'overview',
  'settings',
  'analytics',
  'telephony',
  'test',
  'automations',
  'builder',
  'conversations',
]);

export interface CommunicationCenterUrlState {
  primaryTab: CommunicationPrimaryTab;
  settingsSection: CommunicationSettingsSection;
  channelsSection: CommunicationChannelsSection;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
  inboxFilters: CommunicationInboxFilters;
  whatsappChannelSubview: CommunicationWhatsAppChannelSubview;
  voiceIntent: CommunicationVoiceIntent | null;
}

export const DEFAULT_COMMUNICATION_CENTER_URL_STATE: CommunicationCenterUrlState = {
  primaryTab: 'inbox',
  settingsSection: 'overview',
  channelsSection: 'overview',
  channel: 'all',
  selectedConversationId: null,
  mobilePane: 'inbox',
  inboxFilters: mergeCommunicationInboxFilters(),
  whatsappChannelSubview: 'overview',
  voiceIntent: null,
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
  if (tab === 'channels') return 'channels';
  if (tab === 'automations') return 'automations';
  if (tab === 'ai-activity') return 'ai-activity';
  return 'inbox';
}

export function normalizeCommunicationChannelsSection(
  section: CommunicationChannelsSection | string | null | undefined,
): CommunicationChannelsSection {
  if (section && CHANNELS_SECTIONS.has(section)) {
    return section as CommunicationChannelsSection;
  }
  return 'overview';
}

export function normalizeCommunicationSettingsSection(
  section: CommunicationSettingsSection | string | null | undefined,
): CommunicationSettingsSection {
  if (section && SETTINGS_SECTIONS.has(section)) {
    return section as CommunicationSettingsSection;
  }
  return 'overview';
}

export function normalizeCommunicationWhatsAppChannelSubview(
  subview: CommunicationWhatsAppChannelSubview | string | null | undefined,
): CommunicationWhatsAppChannelSubview {
  if (subview && WHATSAPP_SUBVIEWS.has(subview)) {
    return subview as CommunicationWhatsAppChannelSubview;
  }
  return 'overview';
}

export function normalizeCommunicationVoiceIntent(
  intent: CommunicationVoiceIntent | string | null | undefined,
): CommunicationVoiceIntent | null {
  if (intent && VOICE_INTENTS.has(intent)) {
    return intent as CommunicationVoiceIntent;
  }
  return null;
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

  const channelsSection = params.get(COMMUNICATION_CHANNELS_PARAM);
  if (channelsSection) {
    next.channelsSection = normalizeCommunicationChannelsSection(channelsSection);
  }

  const channel = params.get(COMMUNICATION_CHANNEL_PARAM);
  if (channel && INBOX_CHANNELS.has(channel)) {
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

  const whatsappSubview = params.get(COMMUNICATION_WHATSAPP_SUBVIEW_PARAM);
  if (whatsappSubview) {
    next.whatsappChannelSubview = normalizeCommunicationWhatsAppChannelSubview(whatsappSubview);
  }

  const voiceIntent = params.get(COMMUNICATION_VOICE_INTENT_PARAM);
  if (voiceIntent) {
    next.voiceIntent = normalizeCommunicationVoiceIntent(voiceIntent);
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
    settingsSection: normalizeCommunicationSettingsSection(merged.settingsSection),
    channelsSection: normalizeCommunicationChannelsSection(merged.channelsSection),
    whatsappChannelSubview: normalizeCommunicationWhatsAppChannelSubview(merged.whatsappChannelSubview),
    voiceIntent: normalizeCommunicationVoiceIntent(merged.voiceIntent),
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
    channelsSection: primaryTab === 'channels' ? current.channelsSection : 'overview',
  };
}

export function applyCommunicationChannelsSectionChange(
  current: CommunicationCenterUrlState,
  channelsSection: CommunicationChannelsSection,
): CommunicationCenterUrlState {
  const normalized = normalizeCommunicationChannelsSection(channelsSection);
  if (current.channelsSection === normalized && current.primaryTab === 'channels') return current;
  return {
    ...current,
    primaryTab: 'channels',
    channelsSection: normalized,
  };
}

export function applyCommunicationOpenConversations(
  current: CommunicationCenterUrlState,
  channel: CommunicationChannel,
): CommunicationCenterUrlState {
  return {
    ...current,
    primaryTab: 'inbox',
    channel,
    selectedConversationId: null,
    mobilePane: 'inbox',
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
    [
      COMMUNICATION_CHANNELS_PARAM,
      normalized.primaryTab === 'channels' && normalized.channelsSection !== 'overview'
        ? normalized.channelsSection
        : normalized.primaryTab === 'channels'
          ? 'overview'
          : null,
    ],
    [COMMUNICATION_CHANNEL_PARAM, normalized.channel !== 'all' ? normalized.channel : null],
    [COMMUNICATION_CONVERSATION_PARAM, normalized.selectedConversationId],
    [
      COMMUNICATION_MOBILE_PANE_PARAM,
      normalized.mobilePane !== 'inbox' ? normalized.mobilePane : null,
    ],
    [
      COMMUNICATION_WHATSAPP_SUBVIEW_PARAM,
      normalized.primaryTab === 'channels' &&
      normalized.channelsSection === 'whatsapp' &&
      normalized.whatsappChannelSubview !== 'overview'
        ? normalized.whatsappChannelSubview
        : null,
    ],
    [
      COMMUNICATION_VOICE_INTENT_PARAM,
      normalized.primaryTab === 'channels' &&
      normalized.channelsSection === 'voice' &&
      normalized.voiceIntent
        ? normalized.voiceIntent
        : normalized.primaryTab === 'automations' && normalized.voiceIntent === 'automations'
          ? 'automations'
          : null,
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
  params.delete(COMMUNICATION_CHANNELS_PARAM);
  params.delete(COMMUNICATION_CHANNEL_PARAM);
  params.delete(COMMUNICATION_CONVERSATION_PARAM);
  params.delete(COMMUNICATION_MOBILE_PANE_PARAM);
  params.delete(COMMUNICATION_WHATSAPP_SUBVIEW_PARAM);
  params.delete(COMMUNICATION_VOICE_INTENT_PARAM);
  params.delete('communicationSearch');
  params.delete('communicationUnread');
  params.delete('communicationStatus');
  params.delete('communicationAssignment');
  const query = params.toString();
  return query ? `?${query}` : '';
}

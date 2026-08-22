import type { CommunicationChannel, CommunicationMobilePane } from './communication-center.types';
import {
  COMMUNICATION_CENTER_VIEW,
  COMMUNICATION_CHANNEL_PARAM,
  COMMUNICATION_CONVERSATION_PARAM,
  COMMUNICATION_MOBILE_PANE_PARAM,
  COMMUNICATION_SETTINGS_PARAM,
  COMMUNICATION_TAB_PARAM,
  COMMUNICATION_VIEW_PARAM,
  mergeCommunicationCenterState,
  type CommunicationCenterUrlState,
} from './communication-center-navigation';
import {
  applyCommunicationInboxFiltersToSearchParams,
  mergeCommunicationInboxFilters,
  type CommunicationInboxFilters,
} from './communication-inbox-state';

export type CommunicationCenterDeepLinkOptions = {
  conversationId?: string | null;
  channel?: CommunicationChannel;
  mobilePane?: CommunicationMobilePane;
  inboxFilters?: Partial<CommunicationInboxFilters>;
};

export function buildCommunicationCenterState(
  options: CommunicationCenterDeepLinkOptions = {},
): CommunicationCenterUrlState {
  return mergeCommunicationCenterState({
    primaryTab: 'inbox',
    settingsSection: 'overview',
    channel: options.channel ?? 'all',
    selectedConversationId: options.conversationId ?? null,
    mobilePane: options.mobilePane ?? (options.conversationId ? 'conversation' : 'inbox'),
    inboxFilters: mergeCommunicationInboxFilters(options.inboxFilters),
  });
}

export function buildCommunicationCenterSearchParams(
  options: CommunicationCenterDeepLinkOptions = {},
): URLSearchParams {
  const state = buildCommunicationCenterState(options);
  const params = new URLSearchParams();
  params.set(COMMUNICATION_VIEW_PARAM, COMMUNICATION_CENTER_VIEW);
  applyCommunicationInboxFiltersToSearchParams(params, state.inboxFilters);

  const entries: Array<[string, string | null]> = [
    [COMMUNICATION_TAB_PARAM, null],
    [COMMUNICATION_SETTINGS_PARAM, null],
    [COMMUNICATION_CHANNEL_PARAM, state.channel !== 'all' ? state.channel : null],
    [COMMUNICATION_CONVERSATION_PARAM, state.selectedConversationId],
    [
      COMMUNICATION_MOBILE_PANE_PARAM,
      state.mobilePane !== 'inbox' ? state.mobilePane : null,
    ],
  ];

  for (const [key, value] of entries) {
    if (value) params.set(key, value);
    else params.delete(key);
  }

  return params;
}

export function buildCommunicationCenterUrl(
  options: CommunicationCenterDeepLinkOptions = {},
  pathname = '/rental',
): string {
  const params = buildCommunicationCenterSearchParams(options);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

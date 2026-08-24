import {
  COMMUNICATION_CENTER_VIEW,
  COMMUNICATION_VIEW_PARAM,
  mergeCommunicationCenterState,
  syncCommunicationCenterStateToUrl,
  type CommunicationCenterUrlState,
} from './communication-center-navigation';
import {
  mergeCommunicationInboxFilters,
  readCommunicationInboxFiltersFromUrl,
  type CommunicationInboxFilters,
} from './communication-inbox-state';
import type {
  CommunicationVoiceIntent,
  CommunicationWhatsAppChannelSubview,
} from './communication-center.types';
import {
  readVoiceAssistantStateFromUrl,
  VOICE_ASSISTANT_VIEW,
  VOICE_OPS_TAB_PARAM,
  VOICE_SETTINGS_SECTION_PARAM,
  VOICE_WIZARD_STEP_PARAM,
} from '../voice-assistant/voice-assistant-navigation';

export const LEGACY_WHATSAPP_VIEW = 'whatsapp-business';
export const LEGACY_VOICE_VIEW = VOICE_ASSISTANT_VIEW;

export type LegacyCommunicationRouteFamily = 'whatsapp' | 'voice';

export type LegacyCommunicationDestinationClass =
  | 'communication_operational'
  | 'communication_channels_whatsapp'
  | 'communication_channels_voice'
  | 'communication_automations'
  | 'workflow_automation'
  | 'voice_specialized_retained';

export interface ResolvedLegacyCommunicationRoute {
  view: typeof COMMUNICATION_CENTER_VIEW | 'workflow-automation';
  communicationCenterState?: Partial<CommunicationCenterUrlState>;
  routeFamily: LegacyCommunicationRouteFamily;
  destinationClass: LegacyCommunicationDestinationClass;
  legacyView: string;
}

const WHATSAPP_TAB_ALIASES = new Set(['overview', 'inbox', 'templates', 'settings', 'configuration']);
const WHATSAPP_SUBVIEW_BY_TAB: Record<string, CommunicationWhatsAppChannelSubview | null> = {
  overview: 'overview',
  settings: 'configuration',
  configuration: 'configuration',
  templates: 'templates',
  inbox: null,
};

const SAFE_WHATSAPP_PARAMS = new Set([
  'view',
  'tab',
  'whatsappTab',
  'conversationId',
  'search',
  'filter',
]);

const SAFE_VOICE_PARAMS = new Set([
  'view',
  VOICE_OPS_TAB_PARAM,
  VOICE_WIZARD_STEP_PARAM,
  VOICE_SETTINGS_SECTION_PARAM,
  'conversationId',
]);

/** Params stripped from final canonical URLs after legacy redirect. */
export const LEGACY_COMMUNICATION_QUERY_PARAM_KEYS = [
  'tab',
  'whatsappTab',
  'filter',
  'search',
  VOICE_OPS_TAB_PARAM,
  VOICE_WIZARD_STEP_PARAM,
  VOICE_SETTINGS_SECTION_PARAM,
  'token',
  'accessToken',
  'providerToken',
  'phone',
  'email',
  'debug',
  'payload',
  'webhook',
  'secret',
  'code',
  'state',
] as const;

function parseSearch(search = ''): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

function isUuidLike(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function mapWhatsAppInboxFilter(filter: string | null): Partial<CommunicationInboxFilters> {
  switch (filter?.trim().toLowerCase()) {
    case 'unread':
      return { unreadOnly: true };
    case 'human_handover':
      return { status: 'HUMAN_REQUIRED' };
    case 'ai_suggested':
      return { intent: 'ai_suggested' };
    case 'booking':
      return { intent: 'booking' };
    case 'documents':
      return { intent: 'documents' };
    case 'payment':
      return { intent: 'payment' };
    case 'damage':
      return { intent: 'damage' };
    case 'unknown_customer':
      return { intent: 'unknown_customer' };
    default:
      return {};
  }
}

function resolveWhatsAppLegacyRoute(params: URLSearchParams): ResolvedLegacyCommunicationRoute {
  const tab = (params.get('tab') ?? params.get('whatsappTab') ?? 'overview').toLowerCase();
  const normalizedTab = WHATSAPP_TAB_ALIASES.has(tab) ? tab : 'overview';
  const conversationId = params.get('conversationId');
  const inboxFilters = mergeCommunicationInboxFilters({
    ...readCommunicationInboxFiltersFromUrl(`?${params.toString()}`),
    ...(params.get('search') ? { search: params.get('search')!.slice(0, 120) } : {}),
    ...mapWhatsAppInboxFilter(params.get('filter')),
  });

  if (normalizedTab === 'inbox') {
    return {
      view: COMMUNICATION_CENTER_VIEW,
      routeFamily: 'whatsapp',
      destinationClass: 'communication_operational',
      legacyView: LEGACY_WHATSAPP_VIEW,
      communicationCenterState: {
        primaryTab: 'inbox',
        channel: 'whatsapp',
        selectedConversationId: isUuidLike(conversationId) ? conversationId : null,
        mobilePane: isUuidLike(conversationId) ? 'conversation' : 'inbox',
        inboxFilters,
      },
    };
  }

  if (isUuidLike(conversationId)) {
    return {
      view: COMMUNICATION_CENTER_VIEW,
      routeFamily: 'whatsapp',
      destinationClass: 'communication_operational',
      legacyView: LEGACY_WHATSAPP_VIEW,
      communicationCenterState: {
        primaryTab: 'inbox',
        channel: 'whatsapp',
        selectedConversationId: conversationId,
        mobilePane: 'conversation',
        inboxFilters,
      },
    };
  }

  const subview = WHATSAPP_SUBVIEW_BY_TAB[normalizedTab] ?? 'overview';
  return {
    view: COMMUNICATION_CENTER_VIEW,
    routeFamily: 'whatsapp',
    destinationClass: 'communication_channels_whatsapp',
    legacyView: LEGACY_WHATSAPP_VIEW,
    communicationCenterState: {
      primaryTab: 'channels',
      channelsSection: 'whatsapp',
      whatsappChannelSubview: subview,
      channel: 'whatsapp',
      inboxFilters,
    },
  };
}

function mapVoiceIntentFromLegacy(
  opsTab: string,
  settingsSection: string | null,
  wizardStep: string | null,
): CommunicationVoiceIntent {
  if (
    wizardStep === 'tests' &&
    opsTab !== 'analytics' &&
    opsTab !== 'automations' &&
    opsTab !== 'conversations'
  ) {
    return 'test';
  }
  if (opsTab === 'conversations') return 'conversations';
  if (opsTab === 'analytics') return 'analytics';
  if (opsTab === 'automations') return 'automations';
  if (opsTab === 'settings') {
    if (settingsSection === 'test' || wizardStep === 'tests') return 'test';
    if (settingsSection === 'telephony') return 'telephony';
    if (settingsSection === 'builder') return 'builder';
    return 'settings';
  }
  return 'overview';
}

function isVoiceSpecializedOpsTab(opsTab: string): boolean {
  return opsTab === 'analytics' || opsTab === 'automations' || opsTab === 'settings';
}

function resolveVoiceLegacyRoute(params: URLSearchParams): ResolvedLegacyCommunicationRoute {
  const voiceState = readVoiceAssistantStateFromUrl(`?${params.toString()}`);
  const opsTab = voiceState.opsTab ?? 'overview';
  const intent = mapVoiceIntentFromLegacy(
    opsTab,
    voiceState.settingsSection ?? null,
    voiceState.wizardStep ?? null,
  );
  const conversationId = params.get('conversationId');
  const hasExplicitSpecializedTab =
    isVoiceSpecializedOpsTab(opsTab) ||
    (opsTab === 'settings' && Boolean(voiceState.settingsSection || voiceState.wizardStep));

  if (
    intent === 'conversations' ||
    (isUuidLike(conversationId) && !hasExplicitSpecializedTab)
  ) {
    return {
      view: COMMUNICATION_CENTER_VIEW,
      routeFamily: 'voice',
      destinationClass: 'communication_operational',
      legacyView: LEGACY_VOICE_VIEW,
      communicationCenterState: {
        primaryTab: 'inbox',
        channel: 'voice',
        selectedConversationId: isUuidLike(conversationId) ? conversationId : null,
        mobilePane: isUuidLike(conversationId) ? 'conversation' : 'inbox',
      },
    };
  }

  if (intent === 'automations') {
    return {
      view: COMMUNICATION_CENTER_VIEW,
      routeFamily: 'voice',
      destinationClass: 'communication_automations',
      legacyView: LEGACY_VOICE_VIEW,
      communicationCenterState: {
        primaryTab: 'automations',
        voiceIntent: 'automations',
      },
    };
  }

  const voiceWizardStep =
    intent === 'test' && voiceState.wizardStep === 'tests' && voiceState.settingsSection !== 'test'
      ? 'tests'
      : null;

  return {
    view: COMMUNICATION_CENTER_VIEW,
    routeFamily: 'voice',
    destinationClass: 'voice_specialized_retained',
    legacyView: LEGACY_VOICE_VIEW,
    communicationCenterState: {
      primaryTab: 'channels',
      channelsSection: 'voice',
      voiceIntent: intent,
      voiceWizardStep,
      channel: 'voice',
    },
  };
}

export function isLegacyCommunicationView(view: string | null | undefined): boolean {
  return view === LEGACY_WHATSAPP_VIEW || view === LEGACY_VOICE_VIEW;
}

export function sanitizeLegacyCommunicationParams(
  routeFamily: LegacyCommunicationRouteFamily,
  params: URLSearchParams,
): URLSearchParams {
  const allowlist = routeFamily === 'whatsapp' ? SAFE_WHATSAPP_PARAMS : SAFE_VOICE_PARAMS;
  const sanitized = new URLSearchParams();
  for (const key of allowlist) {
    const value = params.get(key);
    if (value != null && value !== '') sanitized.set(key, value);
  }
  return sanitized;
}

export function resolveLegacyCommunicationRoute(
  search = '',
): ResolvedLegacyCommunicationRoute | null {
  const rawParams = parseSearch(search);
  const view = rawParams.get(COMMUNICATION_VIEW_PARAM);
  if (!isLegacyCommunicationView(view)) return null;

  const routeFamily: LegacyCommunicationRouteFamily =
    view === LEGACY_WHATSAPP_VIEW ? 'whatsapp' : 'voice';
  const params = sanitizeLegacyCommunicationParams(routeFamily, rawParams);

  if (view === LEGACY_WHATSAPP_VIEW) return resolveWhatsAppLegacyRoute(params);
  return resolveVoiceLegacyRoute(params);
}

export function applyResolvedLegacyCommunicationRoute(
  resolved: ResolvedLegacyCommunicationRoute,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  if (resolved.view === COMMUNICATION_CENTER_VIEW && resolved.communicationCenterState) {
    syncCommunicationCenterStateToUrl(
      mergeCommunicationCenterState(resolved.communicationCenterState),
      { replace: options?.replace ?? true, resetQuery: true },
    );
    return;
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(COMMUNICATION_VIEW_PARAM, resolved.view);
  const next = `${url.pathname}${url.search}`;
  if (options?.replace ?? true) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
}

export function redirectLegacyCommunicationRoute(
  search = '',
  options?: { replace?: boolean },
): ResolvedLegacyCommunicationRoute | null {
  const resolved = resolveLegacyCommunicationRoute(search);
  if (!resolved) return null;
  applyResolvedLegacyCommunicationRoute(resolved, options);
  return resolved;
}

export function mapVoiceIntentToAssistantState(
  intent: CommunicationVoiceIntent,
  options?: { wizardStep?: 'tests' | null },
): {
  opsTab: 'overview' | 'settings' | 'analytics' | 'automations' | 'conversations';
  settingsSection?: 'builder' | 'telephony' | 'test' | null;
  wizardStep?: 'tests' | null;
} {
  if (intent === 'test' && options?.wizardStep === 'tests') {
    return { opsTab: 'settings', wizardStep: 'tests', settingsSection: null };
  }
  switch (intent) {
    case 'conversations':
      return { opsTab: 'conversations' };
    case 'analytics':
      return { opsTab: 'analytics' };
    case 'automations':
      return { opsTab: 'automations' };
    case 'test':
      return { opsTab: 'settings', settingsSection: 'test' };
    case 'telephony':
      return { opsTab: 'settings', settingsSection: 'telephony' };
    case 'builder':
      return { opsTab: 'settings', settingsSection: 'builder' };
    case 'settings':
      return { opsTab: 'settings' };
    default:
      return { opsTab: 'overview' };
  }
}

export function mapVoiceAssistantStateToCanonicalVoiceIntent(
  state: {
    opsTab?: 'overview' | 'settings' | 'analytics' | 'automations' | 'conversations';
    settingsSection?: 'builder' | 'telephony' | 'test' | null;
    wizardStep?: string | null;
  },
): Pick<CommunicationCenterUrlState, 'voiceIntent' | 'voiceWizardStep'> {
  const wizardStep = state.wizardStep === 'tests' ? 'tests' : null;
  const intent = mapVoiceIntentFromLegacy(
    state.opsTab ?? 'overview',
    state.settingsSection ?? null,
    wizardStep,
  );
  const voiceWizardStep =
    intent === 'test' && wizardStep === 'tests' && state.settingsSection !== 'test'
      ? 'tests'
      : null;
  return { voiceIntent: intent, voiceWizardStep };
}

export function buildCommunicationCenterStateForVoiceIntent(
  options: {
    opsTab: 'overview' | 'settings' | 'analytics' | 'automations' | 'conversations';
    settingsSection?: 'test' | 'telephony' | 'builder' | null;
    wizardStep?: 'tests' | null;
  },
): Partial<CommunicationCenterUrlState> {
  if (options.opsTab === 'automations') {
    return { primaryTab: 'automations', voiceIntent: 'automations' };
  }
  const intent = mapVoiceIntentFromLegacy(
    options.opsTab,
    options.settingsSection ?? null,
    options.wizardStep ?? null,
  );
  if (intent === 'conversations') {
    return { primaryTab: 'inbox', channel: 'voice' };
  }
  const voiceWizardStep =
    intent === 'test' && options.wizardStep === 'tests' && options.settingsSection !== 'test'
      ? 'tests'
      : null;
  return {
    primaryTab: 'channels',
    channelsSection: 'voice',
    voiceIntent: intent,
    voiceWizardStep,
    channel: 'voice',
  };
}

/**
 * Canonical voice-assistant copy helpers for non-React utilities and ops label functions.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { VoiceConnectionStatus, VoiceAssistantData, VoiceConversationEntry } from '../../../lib/api';
import {
  NAV_GROUPS,
  TAB_DISPLAY_NAMES,
  type LaunchChecklistItem,
  type OperatorStatus,
  type VoiceTab,
} from './voice-assistant.ops';
import type {
  VoiceTestScenario,
  VoiceTestScenarioDefinition,
} from './voice-test-scenarios';

export function resolveVoiceAssistantLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function va(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveVoiceAssistantLocale(locale), key, vars).text;
}

const OPERATOR_STATUS_KEYS: Record<OperatorStatus, TranslationKey> = {
  active: 'voice.status.operator.active',
  ready: 'voice.status.operator.ready',
  inactive: 'voice.status.operator.inactive',
  degraded: 'voice.status.operator.degraded',
  error: 'voice.status.operator.error',
  draft: 'voice.status.operator.draft',
};

export function labelOperatorStatus(locale: string, status: OperatorStatus): string {
  return va(locale, OPERATOR_STATUS_KEYS[status]);
}

export function labelProviderStatus(
  locale: string,
  connectionStatus: VoiceConnectionStatus | undefined,
  elevenLabsOk: boolean | undefined,
  twilioOk?: boolean | undefined,
  pstnProvider?: 'elevenlabs' | 'twilio',
): string {
  if (connectionStatus === 'ERROR') return va(locale, 'voice.status.provider.error');
  if (connectionStatus === 'DEGRADED') return va(locale, 'voice.status.provider.degraded');
  if (connectionStatus === 'NOT_CONFIGURED' || !elevenLabsOk) {
    return va(locale, 'voice.status.provider.notConfigured');
  }
  if (pstnProvider === 'twilio') {
    if (twilioOk === false) return va(locale, 'voice.status.provider.twilioNotConfigured');
    if (connectionStatus === 'CONNECTED' && elevenLabsOk) {
      return va(locale, 'voice.status.provider.diagnosticPstn');
    }
  }
  if (connectionStatus === 'CONNECTED' && elevenLabsOk) {
    return va(locale, 'voice.status.provider.connected');
  }
  return connectionStatus ?? va(locale, 'voice.status.provider.unknown');
}

export function labelTelephonyStatus(locale: string, assistant: VoiceAssistantData | null): string {
  if (assistant?.telephonyStatus?.label) return assistant.telephonyStatus.label;
  if (!assistant?.telephonyEnabled && !assistant?.inboundEnabled) {
    return va(locale, 'voice.status.telephony.disabled');
  }
  if (assistant?.telephonyStatus?.status === 'legacy_diagnostic_only') {
    return va(locale, 'voice.status.provider.diagnosticPstn');
  }
  if (assistant?.phoneNumber) return va(locale, 'voice.status.telephony.numberAssigned');
  return va(locale, 'voice.status.telephony.notConnected');
}

export function labelLastCall(
  locale: string,
  conversations: VoiceConversationEntry[],
  conversationsLoaded: boolean,
): string {
  if (!conversationsLoaded) return va(locale, 'voice.status.lastCall.notAvailable');
  if (!conversations.length) return va(locale, 'voice.status.lastCall.noCalls');
  const latest = [...conversations].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  return new Date(latest.startedAt).toLocaleString();
}

const VOICE_TAB_KEYS: Record<VoiceTab, TranslationKey> = {
  overview: 'voice.nav.tab.overview',
  config: 'voice.nav.tab.config',
  permissions: 'voice.nav.tab.permissions',
  escalation: 'voice.nav.tab.escalation',
  telephony: 'voice.nav.tab.telephony',
  test: 'voice.nav.tab.test',
  logs: 'voice.nav.tab.logs',
  analytics: 'voice.nav.tab.analytics',
  knowledge: 'voice.nav.tab.knowledge',
};

export function labelVoiceTab(locale: string, tab: VoiceTab): string {
  return va(locale, VOICE_TAB_KEYS[tab]);
}

const NAV_GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  setup: 'voice.nav.group.setup',
  operate: 'voice.nav.group.operate',
  improve: 'voice.nav.group.improve',
};

export function localizedNavGroups(locale: string) {
  return NAV_GROUPS.map(group => ({
    ...group,
    label: va(locale, NAV_GROUP_LABEL_KEYS[group.id] ?? 'voice.nav.group.setup'),
    items: group.items.map(item => ({
      ...item,
      label: va(locale, VOICE_TAB_KEYS[item.key]),
    })),
  }));
}

export function localizedTabDisplayNames(locale: string): Record<VoiceTab, string> {
  return Object.fromEntries(
    (Object.keys(TAB_DISPLAY_NAMES) as VoiceTab[]).map(tab => [tab, labelVoiceTab(locale, tab)]),
  ) as Record<VoiceTab, string>;
}

const CHECKLIST_ITEM_IDS = [
  'identity',
  'voice',
  'greeting',
  'systemPrompt',
  'escalation',
  'elevenlabs',
  'agentProvisioned',
  'telephony',
  'testCall',
] as const;

type ChecklistItemId = (typeof CHECKLIST_ITEM_IDS)[number];

function isChecklistItemId(id: string): id is ChecklistItemId {
  return (CHECKLIST_ITEM_IDS as readonly string[]).includes(id);
}

export function localizedLaunchChecklistItem(
  locale: string,
  item: LaunchChecklistItem,
): LaunchChecklistItem {
  if (!isChecklistItemId(item.id)) return item;
  return {
    ...item,
    label: va(locale, `voice.checklist.${item.id}.label` as TranslationKey),
    description: va(locale, `voice.checklist.${item.id}.description` as TranslationKey),
  };
}

type WizardStepStatus = 'complete' | 'current' | 'pending' | 'warning' | 'error';

const WIZARD_STEP_STATUS_KEYS: Record<WizardStepStatus, TranslationKey> = {
  complete: 'voice.telephony.stepStatus.complete',
  current: 'voice.telephony.stepStatus.inProgress',
  pending: 'voice.telephony.stepStatus.pending',
  warning: 'voice.telephony.stepStatus.warning',
  error: 'voice.status.operator.error',
};

export function labelWizardStepStatus(locale: string, status: WizardStepStatus): string {
  return va(locale, WIZARD_STEP_STATUS_KEYS[status]);
}

export type TestSessionPhase =
  | 'idle'
  | 'starting'
  | 'active'
  | 'expired'
  | 'error'
  | 'blocked';

const TEST_SESSION_PHASE_KEYS: Record<TestSessionPhase, TranslationKey> = {
  idle: 'voice.test.phase.ready',
  starting: 'voice.test.phase.starting',
  active: 'voice.test.phase.active',
  expired: 'voice.test.phase.expired',
  error: 'voice.status.operator.error',
  blocked: 'voice.test.phase.blocked',
};

export function labelTestSessionPhase(locale: string, phase: TestSessionPhase): string {
  return va(locale, TEST_SESSION_PHASE_KEYS[phase]);
}

export type TestVerdictId = 'passed' | 'needs_review' | 'failed';

const TEST_VERDICT_KEYS: Record<TestVerdictId, TranslationKey> = {
  passed: 'voice.test.verdict.passed',
  needs_review: 'voice.test.verdict.needsReview',
  failed: 'voice.test.verdict.failed',
};

export function labelTestVerdict(locale: string, verdict: TestVerdictId): string {
  return va(locale, TEST_VERDICT_KEYS[verdict]);
}

export type TelephonyErrorCode = 'loadNumbers' | 'refresh' | 'assign';

const TELEPHONY_ERROR_KEYS: Record<TelephonyErrorCode, TranslationKey> = {
  loadNumbers: 'voice.telephony.error.loadNumbers',
  refresh: 'voice.telephony.error.refresh',
  assign: 'voice.telephony.error.assign',
};

export function labelTelephonyError(locale: string, code: TelephonyErrorCode): string {
  return va(locale, TELEPHONY_ERROR_KEYS[code]);
}

export function localizedVoiceTestScenario(
  locale: string,
  definition: VoiceTestScenarioDefinition,
): VoiceTestScenario {
  return {
    id: definition.id,
    title: va(locale, definition.titleKey),
    prompt: va(locale, definition.promptKey),
    expectedBehavior: definition.expectedBehaviorKeys.map(key => va(locale, key)),
    escalateWhen: definition.escalateWhenKeys.map(key => va(locale, key)),
    permissions: definition.permissionKeys.map(key => va(locale, key)),
    fixTab: definition.fixTab,
  };
}

export function localizedVoiceTestScenarios(
  locale: string,
  definitions: VoiceTestScenarioDefinition[],
): VoiceTestScenario[] {
  return definitions.map(definition => localizedVoiceTestScenario(locale, definition));
}

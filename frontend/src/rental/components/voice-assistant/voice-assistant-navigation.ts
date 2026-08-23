import {
  WIZARD_STEPS,
  type VoiceOpsTab,
  type VoiceWizardStep,
} from './voice-wizard.ops';

export const VOICE_ASSISTANT_VIEW = 'ai-voice-assistant';
export const VOICE_OPS_TAB_PARAM = 'voiceOpsTab';
export const VOICE_WIZARD_STEP_PARAM = 'voiceWizardStep';
export const VOICE_SETTINGS_SECTION_PARAM = 'voiceSettingsSection';

const OPS_TABS = new Set<string>([
  'overview',
  'conversations',
  'automations',
  'analytics',
  'settings',
]);

export const VOICE_SETTINGS_SECTIONS = ['builder', 'telephony', 'test'] as const;
export type VoiceSettingsSection = (typeof VOICE_SETTINGS_SECTIONS)[number];

export interface VoiceAssistantUrlState {
  opsTab: VoiceOpsTab;
  wizardStep: VoiceWizardStep | null;
  settingsSection: VoiceSettingsSection | null;
}

export const DEFAULT_VOICE_ASSISTANT_URL_STATE: VoiceAssistantUrlState = {
  opsTab: 'overview',
  wizardStep: null,
  settingsSection: null,
};

function parseSearch(search = ''): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function normalizeVoiceOpsTab(
  tab: VoiceOpsTab | string | null | undefined,
): VoiceOpsTab {
  if (tab && OPS_TABS.has(tab)) {
    return tab as VoiceOpsTab;
  }
  return 'overview';
}

export function normalizeVoiceWizardStep(
  step: VoiceWizardStep | string | null | undefined,
): VoiceWizardStep | null {
  if (step && (WIZARD_STEPS as readonly string[]).includes(step)) {
    return step as VoiceWizardStep;
  }
  return null;
}

export function normalizeVoiceSettingsSection(
  section: VoiceSettingsSection | string | null | undefined,
): VoiceSettingsSection | null {
  if (section && (VOICE_SETTINGS_SECTIONS as readonly string[]).includes(section)) {
    return section as VoiceSettingsSection;
  }
  return null;
}

export function readVoiceAssistantStateFromUrl(
  search = '',
): Partial<VoiceAssistantUrlState> {
  const params = parseSearch(search);
  const next: Partial<VoiceAssistantUrlState> = {};

  const opsTab = params.get(VOICE_OPS_TAB_PARAM);
  if (opsTab) {
    next.opsTab = normalizeVoiceOpsTab(opsTab);
  }

  const wizardStep = params.get(VOICE_WIZARD_STEP_PARAM);
  if (wizardStep) {
    next.wizardStep = normalizeVoiceWizardStep(wizardStep);
  }

  const settingsSection = params.get(VOICE_SETTINGS_SECTION_PARAM);
  if (settingsSection) {
    next.settingsSection = normalizeVoiceSettingsSection(settingsSection);
  }

  return next;
}

export function mergeVoiceAssistantState(
  partial: Partial<VoiceAssistantUrlState> | undefined,
): VoiceAssistantUrlState {
  return {
    ...DEFAULT_VOICE_ASSISTANT_URL_STATE,
    ...partial,
    opsTab: normalizeVoiceOpsTab(partial?.opsTab),
    wizardStep: normalizeVoiceWizardStep(partial?.wizardStep),
    settingsSection: normalizeVoiceSettingsSection(partial?.settingsSection),
  };
}

export function wantsVoiceTestCenter(state: VoiceAssistantUrlState): boolean {
  return state.settingsSection === 'test' || state.wizardStep === 'tests';
}

/**
 * Resolves test-center deep links for onboarding vs configured assistants.
 * Wizard step applies only while onboarding is active; configured assistants use settings/test.
 */
export function resolveVoiceTestNavigationIntent(
  partial: Partial<VoiceAssistantUrlState> | undefined,
  showWizard: boolean,
): VoiceAssistantUrlState {
  const merged = mergeVoiceAssistantState(partial);
  if (!wantsVoiceTestCenter(merged)) {
    return merged;
  }

  if (showWizard) {
    return {
      ...merged,
      wizardStep: 'tests',
      settingsSection: null,
    };
  }

  return {
    opsTab: 'settings',
    settingsSection: 'test',
    wizardStep: null,
  };
}

export function syncVoiceAssistantStateToUrl(
  state: VoiceAssistantUrlState,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  const normalized = mergeVoiceAssistantState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('view', VOICE_ASSISTANT_VIEW);

  const entries: Array<[string, string | null]> = [
    [VOICE_OPS_TAB_PARAM, normalized.opsTab === 'overview' ? null : normalized.opsTab],
    [VOICE_WIZARD_STEP_PARAM, normalized.wizardStep],
    [VOICE_SETTINGS_SECTION_PARAM, normalized.settingsSection],
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

export function buildVoiceAssistantSearchParams(
  options: {
    opsTab?: VoiceOpsTab;
    wizardStep?: VoiceWizardStep | null;
    settingsSection?: VoiceSettingsSection | null;
  } = {},
): URLSearchParams {
  const state = mergeVoiceAssistantState(options);
  const params = new URLSearchParams();
  params.set('view', VOICE_ASSISTANT_VIEW);
  if (state.opsTab !== 'overview') {
    params.set(VOICE_OPS_TAB_PARAM, state.opsTab);
  }
  if (state.wizardStep) {
    params.set(VOICE_WIZARD_STEP_PARAM, state.wizardStep);
  }
  if (state.settingsSection) {
    params.set(VOICE_SETTINGS_SECTION_PARAM, state.settingsSection);
  }
  return params;
}

export function buildVoiceAssistantUrl(
  options: {
    opsTab?: VoiceOpsTab;
    wizardStep?: VoiceWizardStep | null;
    settingsSection?: VoiceSettingsSection | null;
  } = {},
  pathname = '/rental',
): string {
  const params = buildVoiceAssistantSearchParams(options);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Voice org information architecture — route identifiers and URL helpers.
 * Server workspace (`VoiceWorkspaceView` from API) is navigation source of truth.
 */

import type {
  VoiceOpsTab,
  VoiceSettingsSection,
  VoiceWizardStep,
  VoiceWorkspaceView,
} from '../../../lib/api';

export type {
  VoiceOpsTab,
  VoiceSettingsSection,
  VoiceWizardStep,
  VoicePrimaryState,
  VoiceWorkspaceView,
  VoiceWorkspaceNavigation,
  VoiceWorkspaceIssue,
} from '../../../lib/api';

export const VOICE_URL_PARAMS = {
  step: 'voiceStep',
  tab: 'voiceTab',
  settings: 'voiceSettings',
} as const;

export const VOICE_WIZARD_STEPS = [
  'plan',
  'assistant',
  'knowledge',
  'permissions',
  'phone',
  'availability',
  'tests',
  'activation',
] as const satisfies readonly VoiceWizardStep[];

export const VOICE_OPS_TABS = [
  'overview',
  'conversations',
  'automations',
  'analytics',
  'settings',
] as const satisfies readonly VoiceOpsTab[];

export const VOICE_SETTINGS_SECTIONS = [
  'assistant',
  'knowledge',
  'permissions',
  'telephony',
  'availability',
  'privacy',
  'budget',
  'diagnostics',
] as const satisfies readonly VoiceSettingsSection[];

export interface VoiceRouteState {
  wizardStep: VoiceWizardStep | null;
  opsTab: VoiceOpsTab | null;
  settingsSection: VoiceSettingsSection | null;
}

function parseSearch(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function isVoiceWizardStep(value: string | null | undefined): value is VoiceWizardStep {
  return Boolean(value && (VOICE_WIZARD_STEPS as readonly string[]).includes(value));
}

export function isVoiceOpsTab(value: string | null | undefined): value is VoiceOpsTab {
  return Boolean(value && (VOICE_OPS_TABS as readonly string[]).includes(value));
}

export function isVoiceSettingsSection(
  value: string | null | undefined,
): value is VoiceSettingsSection {
  return Boolean(value && (VOICE_SETTINGS_SECTIONS as readonly string[]).includes(value));
}

export function parseVoiceRouteFromSearch(search = ''): VoiceRouteState {
  const params = parseSearch(search);
  const wizardStep = isVoiceWizardStep(params.get(VOICE_URL_PARAMS.step))
    ? params.get(VOICE_URL_PARAMS.step)
    : null;
  const opsTab = isVoiceOpsTab(params.get(VOICE_URL_PARAMS.tab))
    ? params.get(VOICE_URL_PARAMS.tab)
    : null;
  const settingsSection = isVoiceSettingsSection(params.get(VOICE_URL_PARAMS.settings))
    ? params.get(VOICE_URL_PARAMS.settings)
    : null;

  return {
    wizardStep: wizardStep as VoiceWizardStep | null,
    opsTab: opsTab as VoiceOpsTab | null,
    settingsSection: settingsSection as VoiceSettingsSection | null,
  };
}

export function buildVoiceRouteSearch(input: VoiceRouteState): string {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );

  params.delete(VOICE_URL_PARAMS.step);
  params.delete(VOICE_URL_PARAMS.tab);
  params.delete(VOICE_URL_PARAMS.settings);

  if (input.wizardStep) {
    params.set(VOICE_URL_PARAMS.step, input.wizardStep);
  } else if (input.opsTab) {
    params.set(VOICE_URL_PARAMS.tab, input.opsTab);
    if (input.opsTab === 'settings' && input.settingsSection) {
      params.set(VOICE_URL_PARAMS.settings, input.settingsSection);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function hasVoiceDeepLink(search = ''): boolean {
  const params = parseSearch(search);
  return (
    params.has(VOICE_URL_PARAMS.step) ||
    params.has(VOICE_URL_PARAMS.tab) ||
    params.has(VOICE_URL_PARAMS.settings)
  );
}

export function reconcileVoiceRoute(
  workspace: VoiceWorkspaceView,
  requested: VoiceRouteState,
): VoiceRouteState {
  if (workspace.navigation.phase === 'onboarding') {
    const step = requested.wizardStep ?? workspace.onboardingStep;
    const allowed = workspace.navigation.allowedWizardSteps.includes(step)
      ? step
      : workspace.onboardingStep;
    return { wizardStep: allowed, opsTab: null, settingsSection: null };
  }

  const opsTab = requested.opsTab ?? workspace.navigation.opsTab ?? 'overview';
  const allowedTab = workspace.navigation.allowedOpsTabs.includes(opsTab)
    ? opsTab
    : 'overview';

  let settingsSection: VoiceSettingsSection | null = null;
  if (allowedTab === 'settings') {
    const requestedSection = requested.settingsSection ?? 'assistant';
    settingsSection = workspace.navigation.allowedSettingsSections.includes(requestedSection)
      ? requestedSection
      : 'assistant';
  }

  return { wizardStep: null, opsTab: allowedTab, settingsSection };
}

export function shouldShowOnboardingShell(workspace: VoiceWorkspaceView): boolean {
  return workspace.navigation.phase === 'onboarding';
}

export function maskTechnicalId(
  value: string | null | undefined,
  options?: { reveal?: boolean },
): string {
  if (!value) return '—';
  if (options?.reveal) return value;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

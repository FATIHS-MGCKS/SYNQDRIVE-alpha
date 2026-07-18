export const VOICE_WIZARD_STEPS = [
  'plan',
  'assistant',
  'knowledge',
  'permissions',
  'phone',
  'availability',
  'tests',
  'activation',
] as const;

export type VoiceWizardStepId = (typeof VOICE_WIZARD_STEPS)[number];

export const VOICE_OPS_TABS = [
  'overview',
  'conversations',
  'automations',
  'analytics',
  'settings',
] as const;

export type VoiceOpsTabId = (typeof VOICE_OPS_TABS)[number];

export const VOICE_SETTINGS_SECTIONS = [
  'assistant',
  'knowledge',
  'permissions',
  'telephony',
  'availability',
  'privacy',
  'budget',
  'diagnostics',
] as const;

export type VoiceSettingsSectionId = (typeof VOICE_SETTINGS_SECTIONS)[number];

export const VOICE_PRIMARY_STATES = [
  'NO_PLAN',
  'ONBOARDING',
  'READY_TO_ACTIVATE',
  'ACTIVE',
  'DEGRADED',
  'SUSPENDED',
] as const;

export type VoicePrimaryState = (typeof VOICE_PRIMARY_STATES)[number];

export const VOICE_WORKSPACE_ISSUE_CODES = [
  'subscription_missing',
  'provider_unreachable',
  'provisioning_failed',
  'regulatory_pending',
  'deployment_failed',
  'mcp_unreachable',
  'budget_blocked',
  'suspended',
] as const;

export type VoiceWorkspaceIssueCode = (typeof VOICE_WORKSPACE_ISSUE_CODES)[number];

export function isVoiceWizardStep(value: string): value is VoiceWizardStepId {
  return (VOICE_WIZARD_STEPS as readonly string[]).includes(value);
}

export function isVoiceOpsTab(value: string): value is VoiceOpsTabId {
  return (VOICE_OPS_TABS as readonly string[]).includes(value);
}

export function isVoiceSettingsSection(value: string): value is VoiceSettingsSectionId {
  return (VOICE_SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export function wizardStepIndex(step: VoiceWizardStepId): number {
  return VOICE_WIZARD_STEPS.indexOf(step);
}

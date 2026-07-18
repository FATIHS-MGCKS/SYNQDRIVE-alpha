import type { VoiceDiagnosticRow, VoicePresentationState, VoiceStepItem, VoiceTabItem } from './voice-ui.types';

export const VOICE_UI_WIZARD_STEPS: VoiceStepItem[] = [
  { key: 'plan', label: 'Plan', description: 'Choose a voice plan' },
  { key: 'assistant', label: 'Assistant', description: 'Configure persona' },
  { key: 'knowledge', label: 'Knowledge', description: 'Link org data' },
  { key: 'activation', label: 'Launch', description: 'Go live' },
];

export const VOICE_UI_OPS_TABS: VoiceTabItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Settings', disabled: true },
];

export const VOICE_UI_DIAGNOSTIC_ROWS: VoiceDiagnosticRow[] = [
  { id: 'telephony', label: 'Telephony link', value: 'Connected', status: 'ok' },
  { id: 'agent', label: 'Agent deployment', value: 'Pending', status: 'warn', hint: 'Awaiting provisioning' },
  { id: 'webhooks', label: 'Webhook intake', value: 'Disabled', status: 'error' },
  { id: 'budget', label: 'Budget policy', value: '—', status: 'unknown' },
];

export const VOICE_UI_PRESENTATION_FIXTURES: Record<
  VoicePresentationState,
  { title: string; description: string; tone: 'success' | 'warning' | 'degraded' | 'blocked' | 'info' | 'neutral' }
> = {
  loading: {
    title: 'Loading voice workspace',
    description: 'Fetching assistant configuration.',
    tone: 'neutral',
  },
  empty: {
    title: 'No conversations yet',
    description: 'Completed calls will appear here.',
    tone: 'neutral',
  },
  warning: {
    title: 'Usage approaching limit',
    description: 'Review your plan before the next billing cycle.',
    tone: 'warning',
  },
  degraded: {
    title: 'Voice service degraded',
    description: 'Some automations are paused until diagnostics recover.',
    tone: 'degraded',
  },
  blocked: {
    title: 'Voice rollout blocked',
    description: 'This organization is not enabled for production voice.',
    tone: 'blocked',
  },
  success: {
    title: 'Assistant ready',
    description: 'All readiness checks passed.',
    tone: 'success',
  },
  disabled: {
    title: 'Voice unavailable',
    description: 'Contact your administrator to enable voice.',
    tone: 'neutral',
  },
};

import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceConnectionStatus,
  VoiceConversationEntry,
} from '../../../lib/api';

export type VoiceTab =
  | 'overview'
  | 'config'
  | 'permissions'
  | 'escalation'
  | 'telephony'
  | 'test'
  | 'analytics'
  | 'logs'
  | 'knowledge';

export type OperatorStatus =
  | 'draft'
  | 'ready'
  | 'active'
  | 'inactive'
  | 'degraded'
  | 'error';

export interface LaunchChecklistItem {
  id: string;
  label: string;
  description: string;
  ok: boolean;
  tab: VoiceTab;
  optional?: boolean;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function resolveOperatorStatus(
  assistant: VoiceAssistantData | null,
  readiness: VoiceAssistantReadiness | null,
): OperatorStatus {
  if (!assistant) return 'draft';
  if (assistant.connectionStatus === 'ERROR') return 'error';
  if (assistant.connectionStatus === 'DEGRADED') return 'degraded';
  if (assistant.status === 'ACTIVE') {
    if (readiness && !readiness.ready) return 'degraded';
    return 'active';
  }
  if (assistant.status === 'INACTIVE') return 'inactive';
  if (readiness?.ready) return 'ready';
  return 'draft';
}

export function operatorStatusLabel(status: OperatorStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'ready':
      return 'Ready';
    case 'inactive':
      return 'Inactive';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
    default:
      return 'Draft';
  }
}

export function providerStatusLabel(
  connectionStatus: VoiceConnectionStatus | undefined,
  elevenLabsOk: boolean | undefined,
  twilioOk?: boolean | undefined,
  pstnProvider?: 'elevenlabs' | 'twilio',
): string {
  if (connectionStatus === 'ERROR') return 'Error';
  if (connectionStatus === 'DEGRADED') return 'Degraded';
  if (connectionStatus === 'NOT_CONFIGURED' || !elevenLabsOk) return 'Not configured';
  if (pstnProvider === 'twilio') {
    if (twilioOk === false) return 'Twilio not configured';
    if (connectionStatus === 'CONNECTED' && elevenLabsOk) {
      return 'Diagnostic PSTN only';
    }
  }
  if (connectionStatus === 'CONNECTED' && elevenLabsOk) return 'Connected';
  return connectionStatus ?? 'Unknown';
}

export function telephonyStatusLabel(assistant: VoiceAssistantData | null): string {
  if (assistant?.telephonyStatus?.label) return assistant.telephonyStatus.label;
  if (!assistant?.telephonyEnabled && !assistant?.inboundEnabled) return 'Disabled';
  if (assistant?.telephonyStatus?.status === 'legacy_diagnostic_only') {
    return 'Diagnostic PSTN only';
  }
  if (assistant?.phoneNumber) return 'Number assigned';
  return 'Not connected';
}

export function readinessPercent(readiness: VoiceAssistantReadiness | null): number {
  if (!readiness?.checks.length) return 0;
  const required = readiness.checks.filter(c => c.required !== false);
  const pool = required.length > 0 ? required : readiness.checks;
  const ok = pool.filter(c => c.ok).length;
  return Math.round((ok / pool.length) * 100);
}

export function callsTodayFromConversations(
  conversations: VoiceConversationEntry[],
  loaded: boolean,
): number | null {
  if (!loaded) return null;
  return conversations.filter(c => isToday(c.startedAt)).length;
}

export function hasConversationHistory(conversations: VoiceConversationEntry[]): boolean {
  return conversations.length > 0;
}

export function lastCallLabel(
  conversations: VoiceConversationEntry[],
  conversationsLoaded: boolean,
): string {
  if (!conversationsLoaded) return 'Not available';
  if (!conversations.length) return 'No calls yet';
  const latest = [...conversations].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  return new Date(latest.startedAt).toLocaleString();
}

export function answerRatePercent(assistant: VoiceAssistantData | null): number | null {
  if (!assistant || assistant.totalCalls === 0) return null;
  return Math.round((assistant.answeredCalls / assistant.totalCalls) * 100);
}

export function openEscalationsCount(conversations: VoiceConversationEntry[], loaded: boolean): number | null {
  if (!loaded) return null;
  return conversations.filter(c => c.escalated || c.outcome === 'ESCALATED').length;
}

export function buildLaunchChecklist(
  assistant: VoiceAssistantData | null,
  readiness: VoiceAssistantReadiness | null,
  testPassed: boolean,
): LaunchChecklistItem[] {
  const checkOk = (key: string) => readiness?.checks.find(c => c.key === key)?.ok ?? false;
  const telephonyRequired = Boolean(
    assistant?.telephonyEnabled || assistant?.inboundEnabled,
  );

  return [
    {
      id: 'identity',
      label: 'Assistant identity',
      description: 'Name and role communicate who callers are speaking with.',
      ok: Boolean(assistant?.name?.trim()),
      tab: 'config',
    },
    {
      id: 'voice',
      label: 'Voice selected',
      description: 'Pick an ElevenLabs voice that matches your brand tone.',
      ok: checkOk('voice'),
      tab: 'config',
    },
    {
      id: 'greeting',
      label: 'Greeting set',
      description: 'First spoken message when a caller connects.',
      ok: checkOk('greeting'),
      tab: 'config',
    },
    {
      id: 'systemPrompt',
      label: 'System prompt complete',
      description: 'Core instructions that govern assistant behavior.',
      ok: checkOk('systemPrompt'),
      tab: 'config',
    },
    {
      id: 'escalation',
      label: 'Escalation configured',
      description: 'Human handover number or fallback message for edge cases.',
      ok: checkOk('escalation'),
      tab: 'escalation',
    },
    {
      id: 'elevenlabs',
      label: 'ElevenLabs connected',
      description: 'Provider API must be configured on the server.',
      ok: checkOk('elevenlabs'),
      tab: 'overview',
    },
    {
      id: 'agentProvisioned',
      label: 'Agent provisioned',
      description: 'Activate once to create or update the remote agent.',
      ok: Boolean(assistant?.elevenLabsAgentId),
      tab: 'test',
    },
    {
      id: 'telephony',
      label: 'Telephony ready',
      description: 'Inbound number linked when telephony is enabled.',
      ok: !telephonyRequired || checkOk('phoneConnected'),
      tab: 'telephony',
      optional: !telephonyRequired,
    },
    {
      id: 'testCall',
      label: 'Test call passed',
      description: 'Run a signed test session before going live.',
      ok: testPassed,
      tab: 'test',
      optional: true,
    },
  ];
}

export const TAB_DISPLAY_NAMES: Record<VoiceTab, string> = {
  overview: 'Overview',
  config: 'Configuration',
  permissions: 'Permissions',
  escalation: 'Escalation',
  telephony: 'Telephony',
  test: 'Test Center',
  logs: 'Conversations',
  analytics: 'Analytics',
  knowledge: 'Knowledge Health',
};

export const NAV_GROUPS: {
  id: string;
  label: string;
  items: { key: VoiceTab; label: string; icon: string }[];
}[] = [
  {
    id: 'setup',
    label: 'Setup',
    items: [
      { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { key: 'config', label: 'Configuration', icon: 'settings' },
      { key: 'permissions', label: 'Permissions', icon: 'shield' },
      { key: 'escalation', label: 'Escalation', icon: 'arrow-up-right' },
      { key: 'telephony', label: 'Telephony', icon: 'phone' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { key: 'test', label: 'Test Center', icon: 'play' },
      { key: 'logs', label: 'Conversations', icon: 'file-text' },
    ],
  },
  {
    id: 'improve',
    label: 'Improve',
    items: [
      { key: 'analytics', label: 'Analytics', icon: 'bar-chart-3' },
      { key: 'knowledge', label: 'Knowledge Health', icon: 'book-open' },
    ],
  },
];

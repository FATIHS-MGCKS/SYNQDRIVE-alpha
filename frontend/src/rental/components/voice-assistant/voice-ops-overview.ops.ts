import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceConversationEntry,
  VoiceRemainingMinutes,
  VoiceUsageForecast,
  VoiceWorkspaceView,
} from '../../../lib/api';
import {
  isFinalizedConversation,
  isLegacyDiagnosticConversation,
} from './voice-conversation.utils';

export type VoiceHeroOperationalStatus = 'active' | 'degraded' | 'suspended';

export interface VoiceTodayKpis {
  callsToday: number | null;
  aiResolved: number | null;
  forwarded: number | null;
  callbacks: number | null;
  avgDurationSeconds: number | null;
  minutesConsumed: number | null;
}

export interface VoiceActionItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function todayFinalized(conversations: VoiceConversationEntry[]): VoiceConversationEntry[] {
  return conversations.filter(c => isToday(c.startedAt) && isFinalizedConversation(c));
}

export function resolveHeroOperationalStatus(
  workspace: VoiceWorkspaceView | null,
  assistant: VoiceAssistantData,
  readiness: VoiceAssistantReadiness | null,
): VoiceHeroOperationalStatus {
  if (
    workspace?.primaryState === 'SUSPENDED' ||
    workspace?.rolloutStatus === 'SUSPENDED'
  ) {
    return 'suspended';
  }
  if (
    assistant.connectionStatus === 'DEGRADED' ||
    assistant.connectionStatus === 'ERROR' ||
    workspace?.primaryState === 'DEGRADED' ||
    (assistant.status === 'ACTIVE' && readiness && !readiness.ready)
  ) {
    return 'degraded';
  }
  if (assistant.status === 'ACTIVE') return 'active';
  if (workspace?.primaryState === 'ACTIVE') return 'active';
  return 'degraded';
}

export function maskPhoneNumber(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  const visible = digits.slice(-4);
  const prefix = raw.trim().startsWith('+') ? '+' : '';
  return `${prefix}*** *** ${visible}`;
}

function parseHourMinute(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function resolveReachability(
  assistant: VoiceAssistantData,
  now: Date = new Date(),
): 'reachable' | 'after_hours' | 'unavailable' {
  if (!assistant.inboundEnabled && !assistant.telephonyEnabled) return 'unavailable';
  if (assistant.telephonyStatus?.status === 'telephony_disabled') return 'unavailable';
  if (
    assistant.telephonyStatus?.status === 'no_phone_number' ||
    assistant.telephonyStatus?.status === 'provider_not_connected'
  ) {
    return 'unavailable';
  }

  const start = parseHourMinute(assistant.businessHoursStart);
  const end = parseHourMinute(assistant.businessHoursEnd);
  if (start == null || end == null) return 'reachable';

  const local = new Date(
    now.toLocaleString('en-US', {
      timeZone: assistant.businessHoursTimezone ?? undefined,
    }),
  );
  const minutes = local.getHours() * 60 + local.getMinutes();
  if (start <= end) {
    return minutes >= start && minutes < end ? 'reachable' : 'after_hours';
  }
  return minutes >= start || minutes < end ? 'reachable' : 'after_hours';
}

export function lastSuccessfulCallAt(
  conversations: VoiceConversationEntry[],
  loaded: boolean,
): string | null {
  if (!loaded) return null;
  const success = conversations
    .filter(
      c =>
        isFinalizedConversation(c) &&
        c.outcome === 'RESOLVED' &&
        !isLegacyDiagnosticConversation(c),
    )
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return success[0]?.startedAt ?? null;
}

export function computeTodayKpis(
  conversations: VoiceConversationEntry[],
  loaded: boolean,
): VoiceTodayKpis {
  if (!loaded) {
    return {
      callsToday: null,
      aiResolved: null,
      forwarded: null,
      callbacks: null,
      avgDurationSeconds: null,
      minutesConsumed: null,
    };
  }

  const today = todayFinalized(conversations);
  const aiResolved = today.filter(
    c => c.outcome === 'RESOLVED' && !c.escalated,
  ).length;
  const forwarded = today.filter(
    c => c.escalated || c.outcome === 'ESCALATED',
  ).length;
  const callbacks = today.filter(c => isCallbackConversation(c)).length;

  const durations = today
    .map(c => c.durationSeconds)
    .filter((d): d is number => d != null && d > 0);
  const avgDurationSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : null;
  const minutesConsumed =
    durations.length > 0
      ? Math.round((durations.reduce((sum, d) => sum + d, 0) / 60) * 10) / 10
      : 0;

  return {
    callsToday: today.length,
    aiResolved,
    forwarded,
    callbacks,
    avgDurationSeconds,
    minutesConsumed,
  };
}

export function isCallbackConversation(conversation: VoiceConversationEntry): boolean {
  const reason = conversation.escalationReason?.toLowerCase() ?? '';
  if (reason.includes('callback') || reason.includes('rückruf')) return true;
  const meta = conversation.metadata;
  if (meta && typeof meta === 'object') {
    const flag = (meta as Record<string, unknown>).callbackRequested;
    if (flag === true) return true;
  }
  return false;
}

export function openEscalations(
  conversations: VoiceConversationEntry[],
  loaded: boolean,
): VoiceConversationEntry[] {
  if (!loaded) return [];
  return conversations.filter(
    c =>
      isFinalizedConversation(c) &&
      (c.escalated || c.outcome === 'ESCALATED') &&
      !c.taskId,
  );
}

export function recentConversations(
  conversations: VoiceConversationEntry[],
  loaded: boolean,
  limit = 5,
): VoiceConversationEntry[] {
  if (!loaded) return [];
  return [...conversations]
    .filter(c => isFinalizedConversation(c))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

export function buildOperationalProblems(params: {
  providerWarning: string | null;
  readiness: VoiceAssistantReadiness | null;
  minutes: VoiceRemainingMinutes | null;
  protectionUsagePct: number | null;
  workspace: VoiceWorkspaceView | null;
}): string[] {
  const problems: string[] = [];
  if (params.providerWarning) problems.push(params.providerWarning);
  if (params.readiness && !params.readiness.ready) {
    problems.push(`readiness:${params.readiness.missing?.length ?? 0}`);
  }
  if (
    params.minutes &&
    params.minutes.remainingIncludedMinutes <= 10 &&
    params.minutes.includedMinutes > 0
  ) {
    problems.push('low_minutes');
  }
  if (params.protectionUsagePct != null && params.protectionUsagePct >= 90) {
    problems.push('budget_near_limit');
  }
  if (params.workspace?.issues.some(i => i.blocking)) {
    problems.push('blocking_issue');
  }
  return problems;
}

export function buildActionItems(params: {
  heroStatus: VoiceHeroOperationalStatus;
  reachability: ReturnType<typeof resolveReachability>;
  readiness: VoiceAssistantReadiness | null;
  openEscalationCount: number;
  minutes: VoiceRemainingMinutes | null;
  assistant: VoiceAssistantData;
  lastSuccessAt: string | null;
}): VoiceActionItem[] {
  const items: VoiceActionItem[] = [];

  if (params.heroStatus === 'suspended') {
    items.push({
      id: 'suspended',
      severity: 'critical',
      message: 'suspended',
    });
  } else if (params.heroStatus === 'degraded') {
    items.push({
      id: 'degraded',
      severity: 'warning',
      message: 'degraded',
    });
  }

  if (params.reachability === 'unavailable') {
    items.push({
      id: 'telephony_unavailable',
      severity: 'critical',
      message: 'telephony_unavailable',
    });
  } else if (params.reachability === 'after_hours') {
    items.push({
      id: 'after_hours',
      severity: 'info',
      message: 'after_hours',
    });
  }

  if (params.readiness && !params.readiness.ready && params.assistant.status !== 'ACTIVE') {
    items.push({
      id: 'readiness',
      severity: 'warning',
      message: 'readiness',
    });
  }

  if (params.openEscalationCount > 0) {
    items.push({
      id: 'escalations',
      severity: 'warning',
      message: 'escalations',
    });
  }

  if (
    params.minutes &&
    params.minutes.remainingIncludedMinutes <= 10 &&
    params.minutes.includedMinutes > 0
  ) {
    items.push({
      id: 'low_minutes',
      severity: 'warning',
      message: 'low_minutes',
    });
  }

  if (!params.lastSuccessAt && params.assistant.status === 'ACTIVE') {
    items.push({
      id: 'no_success_yet',
      severity: 'info',
      message: 'no_success_yet',
    });
  }

  return items;
}

export function summarizeAutomationActivity(
  conversations: VoiceConversationEntry[],
  assistant: VoiceAssistantData,
): { recentToolActions: string[]; enabledGroups: number } {
  const enabledGroups = Object.values(assistant.toolPermissions ?? {}).filter(
    mode => mode !== 'DISABLED',
  ).length;

  const actions = new Set<string>();
  for (const conv of conversations) {
    for (const action of conv.actionsPerformed ?? []) {
      if (action.trim()) actions.add(action.trim());
    }
  }

  return {
    recentToolActions: [...actions].slice(0, 6),
    enabledGroups,
  };
}

export function formatForecastHint(
  forecast: VoiceUsageForecast | null,
  locale: string,
): string | null {
  if (!forecast) return null;
  const amount = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: forecast.currency,
  }).format(forecast.projectedRevenueCents / 100);
  return `${forecast.projectedMinutes} min · ${amount}`;
}

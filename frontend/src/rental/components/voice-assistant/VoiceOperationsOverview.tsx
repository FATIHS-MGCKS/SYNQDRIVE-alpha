import { useEffect, useMemo, useState } from 'react';
import { DataCard } from '../../../components/patterns/data-card';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { Icon } from '../ui/Icon';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceConversationEntry,
  VoiceProtectionStatus,
  VoiceRemainingMinutes,
  VoiceUsageForecast,
  VoiceWorkspaceView,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { VoiceKpiCard } from './VoiceOpsKpiStrip';
import { VoiceStatusHero } from './VoiceStatusHero';
import {
  computeTodayKpis,
  formatForecastHint,
  openEscalations,
  recentConversations,
  summarizeAutomationActivity,
  buildOperationalProblems,
} from './voice-ops-overview.ops';
import {
  conversationIntent,
  formatDuration,
  isInbound,
  maskCallerNumber,
  outcomeBadgeTone,
  resolveFollowUpKind,
} from './voice-conversation.utils';

interface VoiceOperationsOverviewProps {
  orgId: string;
  workspace: VoiceWorkspaceView;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  conversations: VoiceConversationEntry[];
  conversationsLoaded: boolean;
  providerWarning: string | null;
  onOpenConversations: (filter?: 'escalated') => void;
  onOpenAnalytics: () => void;
  onOpenAutomations: () => void;
  onOpenSettings: (section: 'telephony' | 'budget' | 'diagnostics') => void;
  onSelectConversation?: (conversation: VoiceConversationEntry) => void;
}

export function VoiceOperationsOverview({
  orgId,
  workspace,
  assistant,
  readiness,
  conversations,
  conversationsLoaded,
  providerWarning,
  onOpenConversations,
  onOpenAnalytics,
  onOpenAutomations,
  onOpenSettings,
  onSelectConversation,
}: VoiceOperationsOverviewProps) {
  const { t, locale } = useLanguage();
  const [minutes, setMinutes] = useState<VoiceRemainingMinutes | null>(null);
  const [forecast, setForecast] = useState<VoiceUsageForecast | null>(null);
  const [protection, setProtection] = useState<VoiceProtectionStatus | null>(null);
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMinutesLoading(true);
    setMinutesError(null);
    void Promise.all([
      api.voiceAssistant.billing.remainingMinutes(orgId),
      api.voiceAssistant.billing.forecast(orgId).catch(() => null),
      api.voiceAssistant.protection.status(orgId).catch(() => null),
    ])
      .then(([minutesData, forecastData, protectionData]) => {
        if (cancelled) return;
        setMinutes(minutesData);
        setForecast(forecastData);
        setProtection(protectionData);
      })
      .catch(err => {
        if (!cancelled) setMinutesError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setMinutesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const todayKpis = useMemo(
    () => computeTodayKpis(conversations, conversationsLoaded),
    [conversations, conversationsLoaded],
  );
  const escalations = useMemo(
    () => openEscalations(conversations, conversationsLoaded),
    [conversations, conversationsLoaded],
  );
  const recent = useMemo(
    () => recentConversations(conversations, conversationsLoaded, 5),
    [conversations, conversationsLoaded],
  );
  const automation = useMemo(
    () => summarizeAutomationActivity(conversations, assistant),
    [conversations, assistant],
  );

  const problemKeys = buildOperationalProblems({
    providerWarning,
    readiness,
    minutes,
    protectionUsagePct: protection?.snapshot.usagePct ?? null,
    workspace,
  });

  const forecastHint = formatForecastHint(forecast, locale);

  return (
    <div className="space-y-4">
      <VoiceStatusHero
        workspace={workspace}
        assistant={assistant}
        readiness={readiness}
        conversations={conversations}
        conversationsLoaded={conversationsLoaded}
      />

      <section aria-labelledby="voice-today-kpis">
        <h2 id="voice-today-kpis" className="mb-2 text-xs font-bold text-foreground">
          {t('voice.ops.todayPerformance')}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <VoiceKpiCard
            label={t('voice.ops.kpi.callsToday')}
            value={todayKpis.callsToday == null ? '—' : todayKpis.callsToday}
            icon="phone-call"
            tone="brand"
          />
          <VoiceKpiCard
            label={t('voice.ops.kpi.aiResolved')}
            value={todayKpis.aiResolved == null ? '—' : todayKpis.aiResolved}
            icon="bot"
            tone="positive"
          />
          <VoiceKpiCard
            label={t('voice.ops.kpi.forwarded')}
            value={todayKpis.forwarded == null ? '—' : todayKpis.forwarded}
            icon="arrow-up-right"
            tone="watch"
          />
          <VoiceKpiCard
            label={t('voice.ops.kpi.callbacks')}
            value={todayKpis.callbacks == null ? '—' : todayKpis.callbacks}
            icon="phone-forwarded"
            tone="neutral"
          />
          <VoiceKpiCard
            label={t('voice.ops.kpi.avgDuration')}
            value={
              todayKpis.avgDurationSeconds == null
                ? '—'
                : formatDuration(todayKpis.avgDurationSeconds)
            }
            icon="clock"
            tone="neutral"
          />
          <VoiceKpiCard
            label={t('voice.ops.kpi.minutesToday')}
            value={todayKpis.minutesConsumed == null ? '—' : `${todayKpis.minutesConsumed}m`}
            icon="timer"
            tone="neutral"
            onClick={onOpenAnalytics}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">{t('voice.ops.finalizedOnly')}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title={t('voice.ops.minutesTitle')}
          description={t('voice.ops.minutesDesc')}
          className="rounded-2xl shadow-[var(--shadow-1)]"
        >
          {minutesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="loader-2" className="h-4 w-4 animate-spin" />
              {t('voice.common.loading')}
            </div>
          ) : minutesError ? (
            <p className="text-xs text-[color:var(--status-critical)]">{minutesError}</p>
          ) : minutes ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground">{t('voice.ops.remaining')}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{minutes.remainingIncludedMinutes}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground">{t('voice.ops.consumed')}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{minutes.consumedMinutes}</p>
              </div>
            </div>
          ) : (
            <EmptyState compact title={t('voice.ops.noUsage')} />
          )}
          {forecastHint && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              {t('voice.ops.forecastHint', { hint: forecastHint })}
            </p>
          )}
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="sq-press mt-3 text-[11px] font-semibold text-[color:var(--brand-ink)] underline-offset-2 hover:underline"
          >
            {t('voice.ops.openAnalytics')}
          </button>
        </DataCard>

        <DataCard
          title={t('voice.ops.escalationsTitle')}
          description={t('voice.ops.escalationsDesc')}
          className="rounded-2xl shadow-[var(--shadow-1)]"
          actions={
            escalations.length > 0 ? (
              <button
                type="button"
                onClick={() => onOpenConversations('escalated')}
                className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
              >
                {t('voice.ops.viewAll')}
              </button>
            ) : undefined
          }
        >
          {!conversationsLoaded ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="loader-2" className="h-4 w-4 animate-spin" />
              {t('voice.common.loading')}
            </div>
          ) : escalations.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('voice.ops.noEscalations')}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {escalations.slice(0, 4).map(item => (
                <li key={item.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectConversation?.(item)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold">
                        {maskCallerNumber(item.callerNumber) ?? t('voice.ops.unknownCaller')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.escalationReason ?? conversationIntent(item) ?? '—'}
                      </p>
                    </div>
                    <StatusChip tone="watch" className="text-[9px] shrink-0">
                      {t('voice.ops.forwarded')}
                    </StatusChip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard
        title={t('voice.ops.recentCalls')}
        description={t('voice.ops.recentCallsDesc')}
        className="rounded-2xl shadow-[var(--shadow-1)]"
        actions={
          <button
            type="button"
            onClick={() => onOpenConversations()}
            className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
          >
            {t('voice.ops.viewAll')}
          </button>
        }
      >
        {!conversationsLoaded ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
            {t('voice.common.loading')}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState compact title={t('voice.ops.noCalls')} />
        ) : (
          <ul className="divide-y divide-border/40">
            {recent.map(call => (
              <li key={call.id}>
                <button
                  type="button"
                  onClick={() => onSelectConversation?.(call)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold">
                      <Icon
                        name={isInbound(call.direction) ? 'phone-incoming' : 'phone-outgoing'}
                        className="h-3 w-3 shrink-0"
                      />
                      {maskCallerNumber(call.callerNumber) ?? t('voice.ops.unknownCaller')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {conversationIntent(call) ?? '—'} · {formatDuration(call.durationSeconds)}
                    </p>
                  </div>
                  <StatusChip tone={outcomeBadgeTone(call.outcome)} className="text-[9px] shrink-0">
                    {t(`voice.conversations.outcome.${call.outcome}` as 'voice.conversations.outcome.RESOLVED')}
                  </StatusChip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard
        title={t('voice.ops.problemsTitle')}
        description={t('voice.ops.problemsDesc')}
        className="rounded-2xl shadow-[var(--shadow-1)]"
      >
        {problemKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('voice.ops.noProblems')}</p>
        ) : (
          <ul className="space-y-2">
            {problemKeys.map(key => (
              <li
                key={key}
                className="flex items-start gap-2 rounded-lg border border-[color:var(--status-watch)]/20 bg-[color:var(--status-watch)]/5 px-3 py-2 text-[11px]"
              >
                <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {key.startsWith('readiness:')
                  ? t('voice.ops.problem.readiness', { count: Number(key.split(':')[1]) || 0 })
                  : t(`voice.ops.problem.${key}` as 'voice.ops.problem.lowMinutes')}
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard
        title={t('voice.ops.automationsTitle')}
        description={t('voice.ops.automationsDesc')}
        className="rounded-2xl shadow-[var(--shadow-1)]"
        actions={
          <button
            type="button"
            onClick={onOpenAutomations}
            className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
          >
            {t('voice.ops.manageAutomations')}
          </button>
        }
      >
        <p className="text-[11px] text-muted-foreground">
          {t('voice.ops.automationsEnabled', { count: automation.enabledGroups })}
        </p>
        {automation.recentToolActions.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {automation.recentToolActions.map(action => (
              <li key={action}>
                <StatusChip tone="info" className="text-[9px]">
                  {action}
                </StatusChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground">{t('voice.ops.noAutomationActivity')}</p>
        )}
      </DataCard>

      <section aria-labelledby="voice-quick-actions">
        <h2 id="voice-quick-actions" className="mb-2 text-xs font-bold text-foreground">
          {t('voice.ops.quickActions')}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { key: 'conversations', label: t('voice.ops.tab.conversations'), icon: 'file-text', onClick: () => onOpenConversations() },
            { key: 'analytics', label: t('voice.ops.tab.analytics'), icon: 'bar-chart-3', onClick: onOpenAnalytics },
            { key: 'telephony', label: t('voice.settings.section.telephony'), icon: 'phone', onClick: () => onOpenSettings('telephony') },
            { key: 'budget', label: t('voice.settings.section.budget'), icon: 'wallet', onClick: () => onOpenSettings('budget') },
          ].map(action => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className="sq-press surface-premium flex min-h-[72px] flex-col items-start justify-between rounded-xl border border-border/50 px-3 py-2.5 text-left"
            >
              <Icon name={action.icon as 'phone'} className="h-4 w-4 text-[color:var(--brand-ink)]" />
              <span className="text-[11px] font-semibold text-foreground">{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

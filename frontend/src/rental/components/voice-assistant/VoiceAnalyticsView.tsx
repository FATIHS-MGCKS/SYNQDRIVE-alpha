import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../../components/patterns/states';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantAnalytics,
  VoiceConversationEntry,
  VoicePlanCatalogEntry,
  VoiceSubscriptionResponse,
  VoiceUsageForecast,
  VoiceUsageSummary,
} from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatDuration } from './voice-conversation.utils';
import {
  analyticsAnsweredFromFinalized,
  deriveAnalyticsInsights,
  usageCostLabel,
} from './voice-analytics.ops';

interface VoiceAnalyticsViewProps {
  orgId: string;
  isDarkMode: boolean;
  cardClassName: string;
  conversations?: VoiceConversationEntry[];
}

export function VoiceAnalyticsView({
  orgId,
  isDarkMode,
  cardClassName,
  conversations = [],
}: VoiceAnalyticsViewProps) {
  const { t, locale } = useLanguage();
  const moneyLocale = locale === 'de' ? 'de-DE' : 'en-US';
  const [analytics, setAnalytics] = useState<VoiceAssistantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.voiceAssistant.analytics(orgId);
      setAnalytics(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const derived = useMemo(
    () => deriveAnalyticsInsights({ conversations, analytics }),
    [conversations, analytics],
  );

  if (loading) {
    return (
      <div className={cn(cardClassName, 'flex items-center justify-center p-8 text-xs text-muted-foreground')}>
        <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" />
        {t('voice.common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(cardClassName, 'p-5')}>
        <p className="mb-3 text-xs text-[color:var(--status-critical)]">{error}</p>
        <button type="button" onClick={() => void load()} className="text-xs font-semibold underline">
          {t('voice.common.retry')}
        </button>
      </div>
    );
  }

  const hasData =
    (analytics && analytics.totalCalls > 0) ||
    derived.quality.finalizedCalls > 0 ||
    conversations.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<Icon name="bar-chart-3" className="h-5 w-5" />}
        title={t('voice.analytics.emptyTitle')}
        description={t('voice.analytics.emptyDesc')}
      />
    );
  }

  const answered = analyticsAnsweredFromFinalized(analytics, conversations);
  const escalationPct =
    derived.quality.escalationRate ??
    (analytics ? Math.round(analytics.escalationRate * 100) : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="info" className="text-[9px]">
          {t('voice.analytics.finalizedOnlyBadge')}
        </StatusChip>
        {derived.quality.pendingExcluded > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t('voice.analytics.pendingExcluded', { count: derived.quality.pendingExcluded })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          {
            label: t('voice.analytics.metric.totalCalls'),
            value: derived.quality.finalizedCalls || analytics?.totalCalls || 0,
          },
          {
            label: t('voice.analytics.metric.answered'),
            value: answered ?? '—',
          },
          {
            label: t('voice.analytics.metric.solutionRate'),
            value:
              derived.quality.solutionRate != null ? `${derived.quality.solutionRate}%` : '—',
          },
          {
            label: t('voice.analytics.metric.escalationRate'),
            value: escalationPct != null ? `${escalationPct}%` : '—',
          },
        ].map(metric => (
          <div key={metric.label} className={cn(cardClassName, 'p-4')}>
            <p className="text-[10px] font-semibold text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="mb-3 text-xs font-bold">{t('voice.analytics.peakHours')}</h4>
          {derived.peakHours.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('voice.analytics.noAggregateData')}</p>
          ) : (
            <ul className="space-y-2">
              {derived.peakHours.map(bucket => (
                <li key={bucket.hour} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {String(bucket.hour).padStart(2, '0')}:00
                  </span>
                  <span className="font-semibold tabular-nums">{bucket.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="mb-3 text-xs font-bold">{t('voice.analytics.topIntents')}</h4>
          {derived.topIntents.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('voice.analytics.noAggregateData')}</p>
          ) : (
            <ul className="space-y-2">
              {derived.topIntents.map(item => (
                <li key={item.label} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="truncate text-muted-foreground">{item.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">{t('voice.analytics.noPiiInCharts')}</p>
        </div>
      </div>

      {analytics && (
        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="mb-2 text-xs font-bold">{t('voice.analytics.avgDuration')}</h4>
          <p className="text-xl font-bold tabular-nums">{formatDuration(analytics.avgDurationSeconds)}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t('voice.analytics.talkMinutes', { minutes: analytics.totalTalkMinutes.toFixed(1) })}
          </p>
        </div>
      )}

      {derived.processGapHints.length > 0 && (
        <div className={cn(cardClassName, 'border-dashed p-4')}>
          <h4 className="mb-2 text-xs font-bold">{t('voice.analytics.processGaps')}</h4>
          <ul className="space-y-1">
            {derived.processGapHints.map(hint => (
              <li key={hint} className="text-[11px] text-muted-foreground">
                {t(`voice.analytics.gap.${hint}` as 'voice.analytics.gap.knowledge_gaps')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analytics?.knowledgeGaps && (
        <div className={cn(cardClassName, 'border-dashed p-4')}>
          <h4 className="mb-2 text-xs font-bold">{t('voice.analytics.knowledgeGaps')}</h4>
          <p className="text-[11px] text-muted-foreground">{analytics.knowledgeGaps.message}</p>
        </div>
      )}

      {derived.providerErrorCount > 0 && (
        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="mb-2 text-xs font-bold">{t('voice.analytics.providerErrors')}</h4>
          <p className="text-[11px] text-muted-foreground">
            {t('voice.analytics.providerErrorsCount', { count: derived.providerErrorCount })}
          </p>
        </div>
      )}
    </div>
  );
}

interface VoiceUsageBillingSectionProps {
  usage: VoiceUsageSummary | null;
  forecast: VoiceUsageForecast | null;
  subscription: VoiceSubscriptionResponse | null;
  plan: VoicePlanCatalogEntry | null;
  cardClassName: string;
}

export function VoiceUsageBillingSection({
  usage,
  forecast,
  subscription,
  plan,
  cardClassName,
}: VoiceUsageBillingSectionProps) {
  const { t, locale } = useLanguage();
  const moneyLocale = locale === 'de' ? 'de-DE' : 'en-US';
  const costLabel = usageCostLabel(usage);

  return (
    <div className={cn(cardClassName, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold">{t('voice.analytics.billingTitle')}</h4>
        <StatusChip tone={costLabel === 'estimated' ? 'watch' : 'success'} className="text-[9px]">
          {t(`voice.analytics.costStatus.${costLabel}` as 'voice.analytics.costStatus.estimated')}
        </StatusChip>
      </div>

      {plan && (
        <p className="text-[11px] text-muted-foreground">
          {t('voice.analytics.plan', { plan: plan.code })}
        </p>
      )}

      {usage && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[
            { label: t('voice.analytics.included'), value: String(usage.includedMinutes) },
            { label: t('voice.analytics.consumed'), value: String(usage.consumedMinutes) },
            { label: t('voice.analytics.overage'), value: String(usage.overageMinutes) },
            {
              label: t('voice.analytics.estimatedCost'),
              value: formatMoneyCents(usage.estimatedUsageRevenueCents, usage.currency, moneyLocale),
            },
          ].map(row => (
            <div key={row.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">{row.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{row.value}</p>
            </div>
          ))}
        </div>
      )}

      {forecast && (
        <p className="text-[10px] text-muted-foreground">
          {t('voice.analytics.forecastDetail', {
            minutes: forecast.projectedMinutes,
            amount: formatMoneyCents(forecast.projectedRevenueCents, forecast.currency, moneyLocale),
          })}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">{t('voice.analytics.estimatedVsFinalNote')}</p>
    </div>
  );
}

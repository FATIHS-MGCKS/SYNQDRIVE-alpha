import { useCallback, useEffect, useState } from 'react';
import { DataCard } from '../../../components/patterns/data-card';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceConversationEntry,
  VoicePlanCatalogEntry,
  VoiceSubscriptionResponse,
  VoiceUsageForecast,
  VoiceUsageSummary,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { VoiceAnalyticsView, VoiceUsageBillingSection } from './VoiceAnalyticsView';

interface VoiceUsageAnalyticsPanelProps {
  orgId: string;
  isDarkMode: boolean;
  cardClassName: string;
  conversations?: VoiceConversationEntry[];
}

export function VoiceUsageAnalyticsPanel({
  orgId,
  isDarkMode,
  cardClassName,
  conversations = [],
}: VoiceUsageAnalyticsPanelProps) {
  const { t } = useLanguage();
  const [usage, setUsage] = useState<VoiceUsageSummary | null>(null);
  const [forecast, setForecast] = useState<VoiceUsageForecast | null>(null);
  const [subscription, setSubscription] = useState<VoiceSubscriptionResponse | null>(null);
  const [plan, setPlan] = useState<VoicePlanCatalogEntry | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setUsageError(null);
    setForecastError(null);
    try {
      const [usageData, subscriptionData] = await Promise.all([
        api.voiceAssistant.billing.usage(orgId),
        api.voiceAssistant.billing.subscription(orgId).catch(() => null),
      ]);
      setUsage(usageData);
      setSubscription(subscriptionData);

      if (usageData.planCode) {
        try {
          const plans = await api.voiceAssistant.billing.plans(orgId);
          setPlan(plans.find(p => p.code === usageData.planCode) ?? null);
        } catch {
          setPlan(null);
        }
        try {
          const forecastData = await api.voiceAssistant.billing.forecast(orgId);
          setForecast(forecastData);
        } catch (err) {
          setForecastError(getErrorMessage(err));
        }
      }
    } catch (err) {
      setUsageError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  return (
    <div className="space-y-4">
      <DataCard
        title={t('voice.analytics.usageTitle')}
        description={t('voice.analytics.usageDesc')}
        className={cn(cardClassName, 'p-4')}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
            {t('voice.common.loading')}
          </div>
        ) : usageError ? (
          <div>
            <p className="text-xs text-[color:var(--status-critical)]">{usageError}</p>
            <button type="button" onClick={() => void loadBilling()} className="mt-2 text-xs font-semibold underline">
              {t('voice.common.retry')}
            </button>
          </div>
        ) : usage ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: t('voice.analytics.included'), value: String(usage.includedMinutes) },
              { label: t('voice.analytics.consumed'), value: String(usage.consumedMinutes) },
              { label: t('voice.analytics.remaining'), value: String(usage.remainingIncludedMinutes) },
              { label: t('voice.analytics.overage'), value: String(usage.overageMinutes) },
            ].map(row => (
              <div key={row.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground">{row.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{row.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {forecastError && (
          <p className="mt-2 text-[10px] text-muted-foreground">{forecastError}</p>
        )}
      </DataCard>

      <VoiceUsageBillingSection
        usage={usage}
        forecast={forecast}
        subscription={subscription}
        plan={plan}
        cardClassName={cardClassName}
      />

      <VoiceAnalyticsView
        orgId={orgId}
        isDarkMode={isDarkMode}
        cardClassName={cardClassName}
        conversations={conversations}
      />
    </div>
  );
}

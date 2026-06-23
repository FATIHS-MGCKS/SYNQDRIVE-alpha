import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BarChart3, PhoneCall, PhoneIncoming, PhoneOff } from 'lucide-react';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceAssistantAnalytics } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { formatDuration } from './voice-conversation.utils';

interface VoiceAnalyticsViewProps {
  orgId: string;
  isDarkMode: boolean;
  cardClassName: string;
  onRequestSync?: () => Promise<void>;
}

export function VoiceAnalyticsView({
  orgId,
  isDarkMode,
  cardClassName,
  onRequestSync,
}: VoiceAnalyticsViewProps) {
  const [analytics, setAnalytics] = useState<VoiceAssistantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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

  const handleSync = async () => {
    if (!onRequestSync) return;
    setSyncing(true);
    try {
      await onRequestSync();
      await load();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(cardClassName, 'p-8 flex items-center justify-center text-xs text-muted-foreground')}>
        <Icon name="loader-2" className="w-4 h-4 animate-spin mr-2" />
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(cardClassName, 'p-5')}>
        <p className="text-xs text-red-500 mb-3">{error}</p>
        <button type="button" onClick={() => void load()} className="text-xs font-semibold underline">
          Retry
        </button>
      </div>
    );
  }

  if (!analytics || analytics.totalCalls === 0) {
    return (
      <EmptyState
        icon={<Icon name="bar-chart-3" className="h-5 w-5" />}
        title="No analytics yet"
        description="Call metrics appear after your first synced conversations. Activate the assistant and sync from ElevenLabs to populate this view."
        action={
          onRequestSync ? (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="sq-press rounded-lg border border-border/60 bg-card px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {syncing ? 'Syncing…' : 'Sync conversations'}
            </button>
          ) : undefined
        }
      />
    );
  }

  const escalationPct = Math.round(analytics.escalationRate * 100);

  const metrics = [
    { label: 'Total Calls', value: analytics.totalCalls, icon: PhoneCall, tone: 'sq-tone-brand' },
    { label: 'Answered', value: analytics.answeredCalls, icon: PhoneIncoming, tone: 'sq-tone-success' },
    {
      label: 'Missed',
      value: analytics.missedCalls,
      icon: PhoneOff,
      tone: analytics.missedCalls > 0 ? 'sq-tone-critical' : 'sq-tone-neutral',
    },
    {
      label: 'Escalated',
      value: analytics.escalatedCalls,
      icon: ArrowUpRight,
      tone: analytics.escalatedCalls > 0 ? 'sq-tone-warning' : 'sq-tone-neutral',
    },
  ];

  const outcomeEntries = Object.entries(analytics.callsByOutcome).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metrics.map(m => (
          <div key={m.label} className={cn(cardClassName, 'p-4')}>
            <div className="mb-2 flex items-center gap-2">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', m.tone)}>
                <m.icon className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{m.value}</p>
          </div>
        ))}

        <div className={cn(cardClassName, 'p-4 col-span-2')}>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl sq-tone-brand">
              <Icon name="clock" className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">Total Talk Time</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {analytics.totalTalkMinutes.toFixed(1)} min
          </p>
        </div>

        <div className={cn(cardClassName, 'p-4')}>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl sq-tone-neutral">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">Avg Duration</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {formatDuration(analytics.avgDurationSeconds)}
          </p>
        </div>

        <div className={cn(cardClassName, 'p-4')}>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl sq-tone-warning">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">Escalation Rate</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{escalationPct}%</p>
        </div>
      </div>

      {outcomeEntries.length > 0 && (
        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="text-xs font-bold mb-3">Calls by outcome</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {outcomeEntries.map(([outcome, count]) => (
              <div
                key={outcome}
                className={cn(
                  'rounded-lg px-3 py-2',
                  isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50',
                )}
              >
                <p className="text-[10px] text-muted-foreground">{outcome}</p>
                <p className="text-lg font-bold tabular-nums">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.topEscalationReasons.length > 0 && (
        <div className={cn(cardClassName, 'p-4')}>
          <h4 className="text-xs font-bold mb-3">Top escalation reasons</h4>
          <div className="space-y-2">
            {analytics.topEscalationReasons.map(item => (
              <div key={item.reason} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate pr-4">{item.reason}</span>
                <span className="font-semibold tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={cn(cardClassName, 'p-4')}>
        <h4 className="text-xs font-bold mb-2">Insights</h4>
        {analytics.insights.hasEnoughData && analytics.insights.topEscalationInsight ? (
          <p className="text-xs text-muted-foreground">{analytics.insights.topEscalationInsight}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not enough call data yet</p>
        )}
      </div>

      <div className={cn(cardClassName, 'p-4 border-dashed')}>
        <h4 className="text-xs font-bold mb-2">Knowledge gaps</h4>
        <p className="text-xs text-muted-foreground">{analytics.knowledgeGaps.message}</p>
      </div>
    </div>
  );
}

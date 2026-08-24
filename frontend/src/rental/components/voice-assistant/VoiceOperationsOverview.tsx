import { useEffect, useState } from 'react';
import { DataCard } from '../../../components/patterns/data-card';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { Icon } from '../ui/Icon';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceRemainingMinutes,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { answerRatePercent, operatorStatusLabel, resolveOperatorStatus } from './voice-assistant.ops';

interface VoiceOperationsOverviewProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  providerWarning: string | null;
  onOpenConversations: () => void;
  onOpenAnalytics: () => void;
}

export function VoiceOperationsOverview({
  orgId,
  assistant,
  readiness,
  providerWarning,
  onOpenConversations,
  onOpenAnalytics,
}: VoiceOperationsOverviewProps) {
  const { t } = useLanguage();
  const [minutes, setMinutes] = useState<VoiceRemainingMinutes | null>(null);
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMinutesLoading(true);
    setMinutesError(null);
    void api.voiceAssistant.billing
      .remainingMinutes(orgId)
      .then(data => {
        if (!cancelled) setMinutes(data);
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

  const operatorStatus = resolveOperatorStatus(assistant, readiness);
  const answerRate = answerRatePercent(assistant);

  const problems: string[] = [];
  if (providerWarning) problems.push(providerWarning);
  if (readiness && !readiness.ready) {
    problems.push(t('voice.ops.problem.readiness', { count: readiness.missing?.length ?? 0 }));
  }
  if (minutes && minutes.remainingIncludedMinutes <= 10 && minutes.includedMinutes > 0) {
    problems.push(t('voice.ops.problem.lowMinutes'));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: t('voice.ops.kpi.status'),
            value: operatorStatusLabel(operatorStatus),
            tone: operatorStatus === 'active' ? 'success' : 'watch',
          },
          {
            label: t('voice.ops.kpi.totalCalls'),
            value: String(assistant.totalCalls),
            tone: 'neutral',
          },
          {
            label: t('voice.ops.kpi.answered'),
            value: String(assistant.answeredCalls),
            tone: 'info',
          },
          {
            label: t('voice.ops.kpi.escalated'),
            value: String(assistant.escalatedCalls),
            tone: 'watch',
          },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="surface-premium rounded-2xl border border-border/40 px-4 py-3 shadow-[var(--shadow-1)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatusChip tone={kpi.tone as 'success'} className="text-[10px]">
                {kpi.value}
              </StatusChip>
            </div>
          </div>
        ))}
      </div>

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
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="sq-press mt-3 text-[11px] font-semibold text-[color:var(--brand-ink)] underline-offset-2 hover:underline"
          >
            {t('voice.ops.openAnalytics')}
          </button>
        </DataCard>

        <DataCard
          title={t('voice.ops.problemsTitle')}
          description={t('voice.ops.problemsDesc')}
          className="rounded-2xl shadow-[var(--shadow-1)]"
        >
          {problems.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('voice.ops.noProblems')}</p>
          ) : (
            <ul className="space-y-2">
              {problems.map(item => (
                <li
                  key={item}
                  className="flex items-start gap-2 rounded-lg border border-[color:var(--status-watch)]/20 bg-[color:var(--status-watch)]/5 px-3 py-2 text-[11px]"
                >
                  <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {assistant.escalatedCalls > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t('voice.ops.openEscalations', { count: assistant.escalatedCalls })}
            </p>
          )}
          {answerRate != null && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('voice.ops.answerRate', { rate: answerRate })}
            </p>
          )}
        </DataCard>
      </div>

      <DataCard
        title={t('voice.ops.inboxHandoffTitle')}
        description={t('voice.ops.inboxHandoffDesc')}
        className="rounded-2xl shadow-[var(--shadow-1)]"
        actions={
          <button
            type="button"
            data-testid="voice-ops-open-conversations"
            onClick={onOpenConversations}
            className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
          >
            {t('voice.ops.viewAll')}
          </button>
        }
      >
        <p className="text-xs text-muted-foreground">{t('voice.ops.inboxHandoffBody')}</p>
      </DataCard>
    </div>
  );
}

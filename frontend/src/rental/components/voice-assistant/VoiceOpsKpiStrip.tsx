import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

export interface VoiceKpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: string;
  tone?: 'neutral' | 'positive' | 'watch' | 'critical' | 'brand';
  onClick?: () => void;
}

const TONE_CLASS: Record<NonNullable<VoiceKpiCardProps['tone']>, string> = {
  neutral: 'border-border/60',
  positive: 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.03]',
  watch: 'border-[color:var(--status-watch)]/25',
  critical: 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04]',
  brand: 'border-[color:var(--brand)]/20',
};

const ICON_TONE: Record<NonNullable<VoiceKpiCardProps['tone']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  positive: 'sq-tone-success',
  watch: 'sq-tone-watch',
  critical: 'sq-tone-critical',
  brand: 'sq-tone-brand',
};

export function VoiceKpiCard({ label, value, hint, icon, tone = 'neutral', onClick }: VoiceKpiCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'surface-premium sq-press relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200',
        onClick && 'hover:-translate-y-px hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        TONE_CLASS[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-[-0.01em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums leading-none tracking-[-0.03em] text-foreground">{value}</p>
          {hint && <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone])}>
          <Icon name={icon as 'phone'} className="h-3.5 w-3.5" />
        </div>
      </div>
    </Tag>
  );
}

interface VoiceOpsKpiStripProps {
  callsToday: number | null;
  missedCalls: number;
  escalatedCalls: number;
  answerRate: number | null;
  talkMinutes: number;
  readinessPercent: number;
  providerWarning: string | null;
  onOpenAnalytics: () => void;
  onOpenOverview: () => void;
}

export function VoiceOpsKpiStrip({
  callsToday,
  missedCalls,
  escalatedCalls,
  answerRate,
  talkMinutes,
  readinessPercent,
  providerWarning,
  onOpenAnalytics,
  onOpenOverview,
}: VoiceOpsKpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <VoiceKpiCard
        label="Calls today"
        value={callsToday == null ? '—' : callsToday}
        hint={callsToday == null ? 'Sync conversations for daily stats' : 'From synced conversations'}
        icon="phone-call"
        tone="brand"
        onClick={onOpenAnalytics}
      />
      <VoiceKpiCard
        label="Missed calls"
        value={missedCalls}
        hint="Lifetime total"
        icon="phone-off"
        tone={missedCalls > 0 ? 'critical' : 'neutral'}
        onClick={onOpenAnalytics}
      />
      <VoiceKpiCard
        label="Escalated"
        value={escalatedCalls}
        hint="Lifetime total"
        icon="arrow-up-right"
        tone={escalatedCalls > 0 ? 'watch' : 'neutral'}
        onClick={onOpenAnalytics}
      />
      <VoiceKpiCard
        label="Answer rate"
        value={answerRate == null ? '—' : `${answerRate}%`}
        hint={answerRate == null ? 'No call volume yet' : 'Answered / total calls'}
        icon="phone-incoming"
        tone={answerRate != null && answerRate >= 80 ? 'positive' : 'neutral'}
        onClick={onOpenAnalytics}
      />
      <VoiceKpiCard
        label="Talk time"
        value={`${talkMinutes.toFixed(1)}m`}
        hint="Lifetime total"
        icon="clock"
        tone="neutral"
        onClick={onOpenAnalytics}
      />
      <VoiceKpiCard
        label="Readiness"
        value={`${readinessPercent}%`}
        hint={providerWarning ?? 'Launch checklist progress'}
        icon="shield"
        tone={readinessPercent >= 100 ? 'positive' : 'watch'}
        onClick={onOpenOverview}
      />
    </div>
  );
}

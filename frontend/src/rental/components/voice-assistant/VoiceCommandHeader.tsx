import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VoiceAssistantData, VoiceAssistantReadiness } from '../../../lib/api';
import {
  operatorStatusLabel,
  providerStatusLabel,
  readinessPercent,
  resolveOperatorStatus,
  telephonyStatusLabel,
  type OperatorStatus,
} from './voice-assistant.ops';

interface VoiceCommandHeaderProps {
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  callsToday: number | null;
  conversationsLoaded: boolean;
  conversationsCount: number;
  lastCall: string;
  openEscalations: number | null;
  isBusy: boolean;
  activating: boolean;
  saving: boolean;
  syncing: boolean;
  testLoading: boolean;
  canActivate: boolean;
  isActive: boolean;
  hasDraft: boolean;
  onActivate: () => void;
  onTest: () => void;
  onSync: () => void;
  onSave: () => void;
}

function statusTone(status: OperatorStatus): 'success' | 'watch' | 'critical' | 'neutral' | 'info' {
  switch (status) {
    case 'active':
      return 'success';
    case 'ready':
      return 'info';
    case 'inactive':
      return 'critical';
    case 'degraded':
      return 'watch';
    case 'error':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function VoiceCommandHeader({
  assistant,
  readiness,
  callsToday,
  conversationsLoaded,
  conversationsCount,
  lastCall,
  openEscalations,
  isBusy,
  activating,
  saving,
  syncing,
  testLoading,
  canActivate,
  isActive,
  hasDraft,
  onActivate,
  onTest,
  onSync,
  onSave,
}: VoiceCommandHeaderProps) {
  const operatorStatus = resolveOperatorStatus(assistant, readiness);
  const elevenLabsOk = readiness?.checks.find(c => c.key === 'elevenlabs')?.ok;
  const readinessPct = readinessPercent(readiness);

  const metaItems = [
    {
      icon: 'zap' as const,
      label: 'Provider',
      value: providerStatusLabel(assistant.connectionStatus, elevenLabsOk),
    },
    {
      icon: 'phone' as const,
      label: 'Telephony',
      value: telephonyStatusLabel(assistant),
    },
    {
      icon: 'hash' as const,
      label: 'Number',
      value: assistant.phoneNumber ?? 'Not connected',
    },
    {
      icon: 'clock' as const,
      label: 'Last call',
      value: lastCall,
    },
    {
      icon: 'phone-call' as const,
      label: 'Calls today',
      value: callsToday == null ? 'Not available' : String(callsToday),
    },
    {
      icon: 'arrow-up-right' as const,
      label: 'Escalations',
      value: openEscalations == null ? 'Not available' : String(openEscalations),
    },
  ];

  return (
    <header className="surface-premium surface-premium animate-fade-up overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]">
      <div className="border-b border-border/40 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
                <Icon name="bot" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  AI Voice Command Center
                </p>
                <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
                  {assistant.name}
                </h1>
              </div>
              <StatusChip tone={statusTone(operatorStatus)} dot className="text-[10px]">
                {operatorStatusLabel(operatorStatus)}
              </StatusChip>
              <StatusChip tone={elevenLabsOk ? 'info' : 'watch'} className="text-[10px]">
                ElevenLabs · {providerStatusLabel(assistant.connectionStatus, elevenLabsOk)}
              </StatusChip>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
              {metaItems.map(item => (
                <div key={item.label} className="min-w-0">
                  <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Icon name={item.icon} className="h-3 w-3 shrink-0 opacity-70" />
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-foreground/90 tabular-nums">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <div className="flex items-center gap-2 self-start sm:self-end">
              <span className="text-[10px] font-medium text-muted-foreground">Readiness</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{readinessPct}%</span>
            </div>
            <div className="h-1.5 w-full min-w-[180px] overflow-hidden rounded-full bg-muted sm:w-48">
              <div
                className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-500 ease-out"
                style={{ width: `${readinessPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {conversationsLoaded
                ? `${conversationsCount} synced conversation(s)`
                : 'Sync conversations to load call history'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onActivate}
          disabled={isBusy || (!isActive && !canActivate)}
          title={!isActive && !canActivate ? 'Complete readiness checks before activating' : undefined}
          className={cn(
            'sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60',
            isActive
              ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]'
              : 'border-[color:var(--status-positive)]/30 bg-[color:var(--status-positive)]/10 text-[color:var(--status-positive)]',
          )}
        >
          <Icon name={activating ? 'loader-2' : isActive ? 'power-off' : 'power'} className={cn('h-3.5 w-3.5', activating && 'animate-spin')} />
          {activating ? 'Working…' : isActive ? 'Deactivate' : 'Activate'}
        </button>

        <button
          type="button"
          onClick={onTest}
          disabled={isBusy || !assistant.elevenLabsAgentId}
          className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 surface-premium px-3.5 py-2 text-[11px] font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
        >
          <Icon name={testLoading ? 'loader-2' : 'mic'} className={cn('h-3.5 w-3.5', testLoading && 'animate-spin')} />
          Test call
        </button>

        <button
          type="button"
          onClick={onSync}
          disabled={isBusy}
          className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 surface-premium px-3.5 py-2 text-[11px] font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
        >
          <Icon name={syncing ? 'loader-2' : 'refresh-cw'} className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          Sync
        </button>

        {hasDraft && (
          <button
            type="button"
            onClick={onSave}
            disabled={isBusy}
            className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-3.5 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] transition-all hover:opacity-90 disabled:opacity-60"
          >
            <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
            Save changes
          </button>
        )}
      </div>
    </header>
  );
}

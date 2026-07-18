import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VoiceAssistantData, VoiceAssistantReadiness } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  maskPhoneNumber,
  resolveHeroOperationalStatus,
  resolveReachability,
} from './voice-ops-overview.ops';
import type { VoiceWorkspaceView } from '../../../lib/api';
import { readinessPercent } from './voice-assistant.ops';

interface VoiceCommandHeaderProps {
  workspace: VoiceWorkspaceView;
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
  testLoading: boolean;
  canActivate: boolean;
  isActive: boolean;
  hasDraft: boolean;
  onActivate: () => void;
  onTest: () => void;
  onSave: () => void;
}

export function VoiceCommandHeader({
  workspace,
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
  testLoading,
  canActivate,
  isActive,
  hasDraft,
  onActivate,
  onTest,
  onSave,
}: VoiceCommandHeaderProps) {
  const { t } = useLanguage();
  const heroStatus = resolveHeroOperationalStatus(workspace, assistant, readiness);
  const reachability = resolveReachability(assistant);
  const readinessPct = readinessPercent(readiness);

  const statusTone =
    heroStatus === 'active' ? 'success' : heroStatus === 'degraded' ? 'watch' : 'critical';

  const metaItems = [
    {
      icon: 'activity' as const,
      label: t('voice.ops.kpi.status'),
      value: t(`voice.ops.hero.status.${heroStatus}` as 'voice.ops.hero.status.active'),
    },
    {
      icon: 'radio' as const,
      label: t('voice.ops.hero.reachabilityLabel'),
      value: t(`voice.ops.hero.reachability.${reachability}` as 'voice.ops.hero.reachability.reachable'),
    },
    {
      icon: 'hash' as const,
      label: t('voice.ops.hero.phone'),
      value: maskPhoneNumber(assistant.phoneNumber),
    },
    {
      icon: 'clock' as const,
      label: t('voice.ops.hero.lastCall'),
      value: lastCall,
    },
    {
      icon: 'phone-call' as const,
      label: t('voice.ops.kpi.callsToday'),
      value: callsToday == null ? '—' : String(callsToday),
    },
    {
      icon: 'arrow-up-right' as const,
      label: t('voice.ops.hero.escalations'),
      value: openEscalations == null ? '—' : String(openEscalations),
    },
  ];

  return (
    <header className="surface-premium animate-fade-up overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]">
      <div className="border-b border-border/40 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
                <Icon name="bot" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('voice.ops.header.eyebrow')}
                </p>
                <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
                  {assistant.name}
                </h1>
              </div>
              <StatusChip tone={statusTone} dot className="text-[10px]">
                {t(`voice.ops.hero.status.${heroStatus}` as 'voice.ops.hero.status.active')}
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
              <span className="text-[10px] font-medium text-muted-foreground">{t('voice.ops.header.readiness')}</span>
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
                ? t('voice.ops.header.conversationsLoaded', { count: conversationsCount })
                : t('voice.ops.header.conversationsLoading')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onActivate}
          disabled={isBusy || (!isActive && !canActivate)}
          title={!isActive && !canActivate ? t('voice.ops.header.activateBlocked') : undefined}
          className={cn(
            'sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60',
            isActive
              ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]'
              : 'border-[color:var(--status-positive)]/30 bg-[color:var(--status-positive)]/10 text-[color:var(--status-positive)]',
          )}
        >
          <Icon
            name={activating ? 'loader-2' : isActive ? 'power-off' : 'power'}
            className={cn('h-3.5 w-3.5', activating && 'animate-spin')}
          />
          {activating
            ? t('voice.ops.header.working')
            : isActive
              ? t('voice.ops.header.deactivate')
              : t('voice.activation.activate')}
        </button>

        <button
          type="button"
          onClick={onTest}
          disabled={isBusy || !assistant.elevenLabsAgentId}
          className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 surface-premium px-3.5 py-2 text-[11px] font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
        >
          <Icon name={testLoading ? 'loader-2' : 'mic'} className={cn('h-3.5 w-3.5', testLoading && 'animate-spin')} />
          {t('voice.ops.header.testCall')}
        </button>

        {hasDraft && (
          <button
            type="button"
            onClick={onSave}
            disabled={isBusy}
            className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-3.5 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] transition-all hover:opacity-90 disabled:opacity-60"
          >
            <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
            {t('voice.common.save')}
          </button>
        )}
      </div>
    </header>
  );
}

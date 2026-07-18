import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceConversationEntry,
  VoiceWorkspaceView,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  buildActionItems,
  lastSuccessfulCallAt,
  maskPhoneNumber,
  openEscalations,
  resolveHeroOperationalStatus,
  resolveReachability,
  type VoiceHeroOperationalStatus,
} from './voice-ops-overview.ops';

interface VoiceStatusHeroProps {
  workspace: VoiceWorkspaceView;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  conversations: VoiceConversationEntry[];
  conversationsLoaded: boolean;
}

function heroTone(status: VoiceHeroOperationalStatus): 'success' | 'watch' | 'critical' {
  switch (status) {
    case 'active':
      return 'success';
    case 'degraded':
      return 'watch';
    default:
      return 'critical';
  }
}

function reachabilityTone(
  reachability: ReturnType<typeof resolveReachability>,
): 'success' | 'watch' | 'neutral' {
  switch (reachability) {
    case 'reachable':
      return 'success';
    case 'after_hours':
      return 'watch';
    default:
      return 'neutral';
  }
}

export function VoiceStatusHero({
  workspace,
  assistant,
  readiness,
  conversations,
  conversationsLoaded,
}: VoiceStatusHeroProps) {
  const { t, locale } = useLanguage();
  const heroStatus = resolveHeroOperationalStatus(workspace, assistant, readiness);
  const reachability = resolveReachability(assistant);
  const lastSuccessAt = lastSuccessfulCallAt(conversations, conversationsLoaded);
  const escalationCount = openEscalations(conversations, conversationsLoaded).length;
  const actionItems = buildActionItems({
    heroStatus,
    reachability,
    readiness,
    openEscalationCount: escalationCount,
    minutes: null,
    assistant,
    lastSuccessAt,
  });

  const statusKey = `voice.ops.hero.status.${heroStatus}` as const;
  const reachabilityKey = `voice.ops.hero.reachability.${reachability}` as const;

  return (
    <section
      className="surface-premium overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]"
      aria-labelledby="voice-status-hero-title"
    >
      <div className="border-b border-border/40 bg-gradient-to-br from-[color:var(--brand-soft)]/30 to-transparent px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
                <Icon name="bot" className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p
                  id="voice-status-hero-title"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {t('voice.ops.hero.title')}
                </p>
                <h2 className="truncate font-display text-lg font-bold text-foreground">{assistant.name}</h2>
              </div>
              <StatusChip tone={heroTone(heroStatus)} dot className="text-[10px]">
                {t(statusKey)}
              </StatusChip>
              <StatusChip tone={reachabilityTone(reachability)} className="text-[10px]">
                {t(reachabilityKey)}
              </StatusChip>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] font-medium text-muted-foreground">{t('voice.ops.hero.phone')}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {maskPhoneNumber(assistant.phoneNumber)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-muted-foreground">
                  {t('voice.ops.hero.lastSuccess')}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-foreground">
                  {!conversationsLoaded
                    ? '—'
                    : lastSuccessAt
                      ? new Date(lastSuccessAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')
                      : t('voice.ops.hero.noSuccessYet')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-muted-foreground">
                  {t('voice.ops.hero.escalations')}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {!conversationsLoaded ? '—' : escalationCount}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {actionItems.length > 0 && (
        <div className="px-4 py-3 sm:px-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('voice.ops.hero.actionNeeded')}
          </p>
          <ul className="space-y-2">
            {actionItems.map(item => (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]',
                  item.severity === 'critical' &&
                    'border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical)]/5',
                  item.severity === 'warning' &&
                    'border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/5',
                  item.severity === 'info' && 'border-border/50 bg-muted/20',
                )}
              >
                <Icon
                  name={item.severity === 'info' ? 'info' : 'alert-triangle'}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                <span>{t(`voice.ops.hero.action.${item.message}` as 'voice.ops.hero.action.degraded')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

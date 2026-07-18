import { useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { VoiceInlineNotice, VoiceSectionHeader, VoiceSkeleton } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceActivationSummary, VoiceActivationSummaryLevel } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';

interface VoiceActivationSummaryPanelProps {
  orgId: string;
  canActivateLocal: boolean;
  onNavigateSection?: (section: string) => void;
}

function levelTone(level: VoiceActivationSummaryLevel): 'success' | 'watch' | 'critical' {
  if (level === 'READY') return 'success';
  if (level === 'WARNING') return 'watch';
  return 'critical';
}

function SectionBlock({
  title,
  items,
  t,
  onNavigateSection,
}: {
  title: string;
  items: VoiceActivationSummary['blockers'];
  t: ReturnType<typeof useLanguage>['t'];
  onNavigateSection?: (section: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.map(item => (
        <div
          key={item.id}
          className={cn(
            'flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between',
            item.level === 'READY'
              ? 'border-[color:var(--status-positive)]/20 bg-[color:var(--status-positive)]/[0.03]'
              : item.level === 'WARNING'
                ? 'border-[color:var(--status-watch)]/20 bg-[color:var(--status-watch)]/[0.03]'
                : 'border-[color:var(--status-critical)]/20 bg-[color:var(--status-critical)]/[0.03]',
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <Icon
              name={item.level === 'READY' ? 'check-circle-2' : item.level === 'WARNING' ? 'alert-triangle' : 'x-circle'}
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                item.level === 'READY'
                  ? 'text-[color:var(--status-positive)]'
                  : item.level === 'WARNING'
                    ? 'text-[color:var(--status-watch)]'
                    : 'text-[color:var(--status-critical)]',
              )}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-semibold text-foreground">{item.label}</p>
                <StatusChip tone={levelTone(item.level)} className="text-[9px]">
                  {item.level === 'READY'
                    ? t('voice.activation.level.ready')
                    : item.level === 'WARNING'
                      ? t('voice.activation.level.warning')
                      : t('voice.activation.level.blocker')}
                </StatusChip>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.message}</p>
            </div>
          </div>
          {item.level !== 'READY' && onNavigateSection && (
            <button
              type="button"
              onClick={() => onNavigateSection(item.section)}
              className="sq-press shrink-0 self-start rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold sm:self-center"
            >
              {t('voice.activation.review')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function VoiceActivationSummaryPanel({
  orgId,
  canActivateLocal,
  onNavigateSection,
}: VoiceActivationSummaryPanelProps) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<VoiceActivationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void api.voiceAssistant.activationSummary(orgId)
      .then(setSummary)
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return <VoiceSkeleton className="h-40 rounded-2xl" />;
  }

  if (error) {
    return (
      <VoiceInlineNotice tone="blocked" title={t('voice.common.actionFailed')}>
        {error}
      </VoiceInlineNotice>
    );
  }

  if (!summary) return null;

  const serverCanActivate = summary.canActivate;
  const showMismatch = canActivateLocal !== serverCanActivate;

  return (
    <div className="space-y-4">
      <VoiceSectionHeader
        title={t('voice.activation.summaryTitle')}
        description={t('voice.activation.summaryDesc')}
        actions={
          <StatusChip tone={serverCanActivate ? 'success' : 'watch'} className="text-[10px]">
            {serverCanActivate ? t('voice.activation.level.ready') : t('voice.activation.level.blocker')}
          </StatusChip>
        }
      />

      {!summary.stagingLiveCallsEnabled && (
        <VoiceInlineNotice tone="info" title={t('voice.activation.killSwitchTitle')}>
          {t('voice.activation.killSwitchDesc')}
        </VoiceInlineNotice>
      )}

      {showMismatch && (
        <VoiceInlineNotice tone="warning" title={t('voice.activation.serverGateTitle')}>
          {t('voice.activation.serverGateDesc')}
        </VoiceInlineNotice>
      )}

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <p className="text-[10px] text-muted-foreground">
          {t('voice.activation.rolloutStatus', { status: summary.rolloutStatus })}
        </p>

        <div className="mt-4 space-y-5">
          <SectionBlock
            title={t('voice.activation.blockers')}
            items={summary.blockers}
            t={t}
            onNavigateSection={onNavigateSection}
          />
          <SectionBlock
            title={t('voice.activation.warnings')}
            items={summary.warnings}
            t={t}
            onNavigateSection={onNavigateSection}
          />
          <SectionBlock
            title={t('voice.activation.readyItems')}
            items={summary.ready}
            t={t}
            onNavigateSection={onNavigateSection}
          />
        </div>
      </div>
    </div>
  );
}

import { StatusChip } from '../../../components/patterns';
import { Skeleton } from '../../../components/ui/skeleton';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { CommunicationSettingsSection } from './communication-center.types';
import { useCommunicationSettingsOverview } from './useCommunicationSettingsOverview';

interface CommunicationSettingsOverviewProps {
  enabled?: boolean;
  onNavigate: (section: CommunicationSettingsSection) => void;
}

const channelTitleKey = {
  whatsapp: 'communication.settings.whatsapp.title',
  voice: 'communication.settings.voice.title',
  sms: 'communication.settings.sms.title',
} as const;

const channelDescriptionKey = {
  whatsapp: 'communication.settings.whatsapp.overviewDescription',
  voice: 'communication.settings.voice.overviewDescription',
  sms: 'communication.settings.sms.overviewDescription',
} as const;

function statusTone(status: string): 'success' | 'watch' | 'critical' | 'info' {
  if (status === 'CONNECTED' || status === 'CONFIGURED') return 'success';
  if (status === 'DEGRADED') return 'critical';
  if (status === 'DISABLED') return 'info';
  return 'watch';
}

export function CommunicationSettingsOverview({
  enabled = true,
  onNavigate,
}: CommunicationSettingsOverviewProps) {
  const { t } = useLanguage();
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const overview = useCommunicationSettingsOverview({
    orgId,
    enabled,
    hasPermission,
    membershipRole: userRole,
  });

  return (
    <div className="space-y-3" data-testid="communication-settings-overview">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t('communication.settings.overview.title')}</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('communication.settings.overview.description')}
        </p>
      </div>

      <div className="grid gap-3">
        {overview.channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            data-testid={`communication-settings-overview-${channel.key}`}
            className={cn(
              'surface-premium sq-press flex w-full items-start justify-between gap-3 rounded-2xl border border-border/40 p-4 text-left shadow-[var(--shadow-1)]',
              'hover:border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/30',
            )}
            onClick={() => onNavigate(channel.key)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-foreground">
                  {t(channelTitleKey[channel.key])}
                </h3>
                {channel.loading ? (
                  <Skeleton className="h-5 w-20 rounded-full" />
                ) : (
                  <StatusChip tone={statusTone(channel.status)}>
                    {t(`communication.settings.status.${channel.status}` as const)}
                  </StatusChip>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(channelDescriptionKey[channel.key])}
              </p>
              {channel.error && (
                <p className="mt-2 text-[11px] text-[color:var(--status-critical)]">
                  {t('communication.settings.loadError')}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-[color:var(--brand)]">
              {channel.status === 'NOT_CONFIGURED'
                ? t('communication.settings.action.configure')
                : t('communication.settings.action.manage')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from '../../../components/ui/skeleton';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { CommunicationChannelsSection } from './communication-center.types';
import { CommunicationChannelStatusChip } from './communication-channel-status';
import { useCommunicationChannelsOverview } from './useCommunicationChannelsOverview';

const channelTitleKey = {
  whatsapp: 'communication.channels.whatsapp',
  voice: 'communication.channels.voice',
  sms: 'communication.channels.sms',
  email: 'communication.channels.email',
} as const;

const channelDescriptionKey = {
  whatsapp: 'communication.channels.whatsapp.description',
  voice: 'communication.channels.voice.description',
  sms: 'communication.channels.sms.description',
  email: 'communication.channels.email.description',
} as const;

interface CommunicationChannelsLandingProps {
  enabled?: boolean;
  onNavigate: (section: CommunicationChannelsSection) => void;
}

export function CommunicationChannelsLanding({
  enabled = true,
  onNavigate,
}: CommunicationChannelsLandingProps) {
  const { t } = useLanguage();
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const overview = useCommunicationChannelsOverview({
    orgId,
    enabled,
    hasPermission,
    membershipRole: userRole,
  });

  return (
    <div className="space-y-3" data-testid="communication-channels-landing">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t('communication.channels.title')}</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('communication.channels.description')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {overview.channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            data-testid={`communication-channels-card-${channel.key}`}
            disabled={!channel.accessible}
            className={cn(
              'surface-premium border border-border/40 p-4 text-left transition-colors',
              channel.accessible
                ? 'sq-press hover:border-[color:var(--brand)]/30'
                : 'cursor-not-allowed opacity-70',
            )}
            onClick={() => channel.accessible && onNavigate(channel.key)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-foreground">
                  {t(channelTitleKey[channel.key])}
                </h3>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('communication.channels.providerLabel')}: {channel.provider}
                </p>
              </div>
              {channel.loading ? (
                <Skeleton className="h-5 w-20 rounded-full" />
              ) : (
                <CommunicationChannelStatusChip
                  status={channel.status}
                  label={t(`communication.settings.status.${channel.status}` as const)}
                />
              )}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t(channelDescriptionKey[channel.key])}
            </p>
            {channel.error && (
              <p className="mt-2 text-[10px] text-[color:var(--status-critical)]">{channel.error}</p>
            )}
            {!channel.accessible && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {t('communication.channels.accessRestricted')}
              </p>
            )}
            {channel.accessible && (
              <span className="mt-3 inline-block text-[10px] font-semibold text-[color:var(--brand)]">
                {t('communication.channels.configure')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

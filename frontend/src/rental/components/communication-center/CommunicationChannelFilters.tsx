import { Inbox, MessageSquare, Phone, MessagesSquare } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationChannel } from './communication-center.types';

const CHANNELS: CommunicationChannel[] = ['all', 'whatsapp', 'voice', 'sms'];

interface CommunicationChannelFiltersProps {
  activeChannel: CommunicationChannel;
  onChannelChange: (channel: CommunicationChannel) => void;
  className?: string;
}

function channelIcon(channel: CommunicationChannel) {
  switch (channel) {
    case 'whatsapp':
      return MessageSquare;
    case 'voice':
      return Phone;
    case 'sms':
      return MessagesSquare;
    default:
      return Inbox;
  }
}

function channelLabelKey(channel: CommunicationChannel) {
  return `communication.channels.${channel}` as const;
}

export function CommunicationChannelFilters({
  activeChannel,
  onChannelChange,
  className,
}: CommunicationChannelFiltersProps) {
  const { t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t('communication.channels.filterGroup')}
      className={cn(
        'flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {CHANNELS.map((channel) => {
        const Icon = channelIcon(channel);
        const isActive = activeChannel === channel;
        return (
          <button
            key={channel}
            type="button"
            aria-pressed={isActive}
            data-channel={channel}
            onClick={() => onChannelChange(channel)}
            className={cn(
              'sq-press inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40',
              isActive
                ? 'bg-[color:var(--brand)]/12 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/25'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t(channelLabelKey(channel))}</span>
          </button>
        );
      })}
    </div>
  );
}

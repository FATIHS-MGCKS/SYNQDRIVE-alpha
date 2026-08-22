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
      role="tablist"
      aria-label={t('communication.channels.ariaLabel')}
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
            role="tab"
            aria-selected={isActive}
            data-channel={channel}
            onClick={() => onChannelChange(channel)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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

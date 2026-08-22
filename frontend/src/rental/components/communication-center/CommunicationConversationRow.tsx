import { MessageSquare, MessagesSquare, Phone } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import type { CommunicationApiChannel } from '../../../lib/communication/types';
import { buildConversationContextLabel } from '../../../lib/communication/context-label';
import { formatCommunicationTimestamp } from '../../../lib/communication/format';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import {
  resolveConversationPreview,
  resolveConversationTitle,
} from './communication-inbox-display';

interface CommunicationConversationRowProps {
  conversation: CommunicationConversationListItem;
  selected: boolean;
  locale: string;
  onSelect: (conversationId: string) => void;
}

function channelLabelKey(channel: CommunicationApiChannel) {
  switch (channel) {
    case 'WHATSAPP':
      return 'communication.channels.whatsapp' as const;
    case 'VOICE':
      return 'communication.channels.voice' as const;
    case 'SMS':
      return 'communication.channels.sms' as const;
    default:
      return 'communication.channels.all' as const;
  }
}

function ChannelIcon({ channel }: { channel: CommunicationApiChannel }) {
  const className = 'h-3.5 w-3.5 shrink-0';
  switch (channel) {
    case 'WHATSAPP':
      return <MessageSquare className={className} aria-hidden />;
    case 'VOICE':
      return <Phone className={className} aria-hidden />;
    case 'SMS':
      return <MessagesSquare className={className} aria-hidden />;
    default:
      return null;
  }
}

export function CommunicationConversationRow({
  conversation,
  selected,
  locale,
  onSelect,
}: CommunicationConversationRowProps) {
  const { t } = useLanguage();
  const unread = conversation.unreadCount > 0;
  const title = resolveConversationTitle(conversation, t);
  const preview = resolveConversationPreview(conversation, t);
  const contextLabel = buildConversationContextLabel(conversation);
  const timestamp = formatCommunicationTimestamp(conversation.lastActivityAt, locale, t);
  const channelLabel = t(channelLabelKey(conversation.channel));

  return (
    <button
      type="button"
      data-testid="communication-conversation-row"
      data-conversation-id={conversation.id}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${channelLabel}: ${title}`}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'sq-press w-full rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40',
        selected
          ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand)]/8'
          : 'border-border/30 hover:bg-muted/30',
        unread && !selected && 'bg-muted/20',
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            selected ? 'bg-[color:var(--brand)]/15 text-[color:var(--brand)]' : 'bg-muted/50 text-muted-foreground',
          )}
        >
          <ChannelIcon channel={conversation.channel} />
          <span className="sr-only">{channelLabel}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                'truncate text-[12px] text-foreground',
                unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {title}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{timestamp}</span>
          </div>
          {preview && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{preview}</p>
          )}
          {contextLabel && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">{contextLabel}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {unread && (
              <span
                className="inline-flex min-w-[1.1rem] items-center justify-center rounded-md bg-[color:var(--brand)] px-1 py-0.5 text-[9px] font-bold tabular-nums text-white"
                aria-label={t('communication.inbox.unreadCount', { count: conversation.unreadCount })}
              >
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
            {conversation.assignedUser ? (
              <span className="text-[10px] text-muted-foreground">
                {t('communication.inbox.assignedTo', {
                  name: conversation.assignedUser.displayName,
                })}
              </span>
            ) : (
              <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('communication.inbox.unassigned')}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

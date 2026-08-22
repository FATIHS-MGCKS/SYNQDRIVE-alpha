import { MessageSquare, MessagesSquare, Phone } from 'lucide-react';
import { StatusChip } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import { buildConversationContextLabel } from '../../../../lib/communication/context-label';
import { formatCommunicationTimestamp } from '../../../../lib/communication/format';
import type { CommunicationApiChannel, CommunicationConversationListItem } from '../../../../lib/communication/types';
import type { TranslationKey } from '../../../i18n/translations/en';
import {
  resolveConversationPreview,
  resolveConversationTitle,
} from '../../communication-center/communication-inbox-display';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';

interface CommunicationDashboardRowProps {
  conversation: CommunicationConversationListItem;
  locale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpen: (conversation: CommunicationConversationListItem) => void;
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

function primaryAttentionBadge(
  conversation: CommunicationConversationListItem,
  t: (key: TranslationKey) => string,
) {
  if (conversation.status === 'HUMAN_REQUIRED') {
    return (
      <StatusChip tone="critical" className="shrink-0">
        {t('communication.dashboard.humanRequired')}
      </StatusChip>
    );
  }
  if (!conversation.assignedUser) {
    return (
      <StatusChip tone="watch" className="shrink-0">
        {t('communication.dashboard.unassignedBadge')}
      </StatusChip>
    );
  }
  return null;
}

export function CommunicationDashboardRow({
  conversation,
  locale,
  t,
  onOpen,
}: CommunicationDashboardRowProps) {
  const title = resolveConversationTitle(conversation, t);
  const preview = resolveConversationPreview(conversation, t);
  const contextLabel = buildConversationContextLabel(conversation);
  const timestamp = formatCommunicationTimestamp(conversation.lastActivityAt, locale, t);
  const channelLabel = t(channelLabelKey(conversation.channel));
  const unread = conversation.unreadCount > 0;
  const attentionBadge = primaryAttentionBadge(conversation, t);

  return (
    <button
      type="button"
      data-testid="dashboard-communication-row"
      data-conversation-id={conversation.id}
      aria-label={`${channelLabel}: ${title}`}
      onClick={() => onOpen(conversation)}
      className={cn(
        'sq-press w-full rounded-lg border border-border/30 px-2.5 py-2 text-left transition-colors',
        'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40',
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
          aria-hidden
        >
          <ChannelIcon channel={conversation.channel} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn(NOTIFICATION_PANEL_TYPO.childTitle, 'truncate text-foreground')}>{title}</p>
              {preview && (
                <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 truncate text-muted-foreground')}>
                  {preview}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'text-muted-foreground')}>{timestamp}</span>
              {unread && (
                <span
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[color:var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  aria-label={t('communication.inbox.unreadCount', { count: conversation.unreadCount })}
                >
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'text-muted-foreground')}>{channelLabel}</span>
            {attentionBadge}
            {contextLabel && (
              <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'truncate text-muted-foreground')}>
                {contextLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

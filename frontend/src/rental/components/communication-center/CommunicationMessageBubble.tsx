import { cn } from '../../../components/ui/utils';
import type { TranslationKey } from '../../i18n/translations/en';
import type { CommunicationApiChannel } from '../../../lib/communication/types';
import type { MessageDirection } from '../../../lib/communication/timeline-presentation';
import { formatCommunicationTimestamp } from '../../../lib/communication/format';

interface CommunicationMessageBubbleProps {
  direction: MessageDirection;
  channel: CommunicationApiChannel;
  contentLabel: string;
  text: string | null;
  showMediaLabel?: boolean;
  truncated: boolean;
  attachmentCount: number;
  hasAttachments: boolean;
  occurredAt: string;
  locale: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function channelLabelKey(channel: CommunicationApiChannel): TranslationKey {
  switch (channel) {
    case 'WHATSAPP':
      return 'communication.channels.whatsapp';
    case 'SMS':
      return 'communication.channels.sms';
    case 'VOICE':
      return 'communication.channels.voice';
    default:
      return 'communication.channels.all';
  }
}

export function CommunicationMessageBubble({
  direction,
  channel,
  contentLabel,
  text,
  showMediaLabel = false,
  truncated,
  attachmentCount,
  hasAttachments,
  occurredAt,
  locale,
  t,
}: CommunicationMessageBubbleProps) {
  const isInbound = direction === 'inbound';
  const timeLabel = formatCommunicationTimestamp(occurredAt, locale, t);
  const directionLabel =
    direction === 'inbound'
      ? t('communication.timeline.inboundMessage')
      : t('communication.timeline.outboundMessage');
  const channelLabel = t(channelLabelKey(channel));
  const ariaLabel = `${directionLabel}, ${channelLabel}, ${timeLabel}`;

  return (
    <div
      data-testid="communication-message-bubble"
      data-direction={direction}
      className={cn('flex w-full', isInbound ? 'justify-start' : 'justify-end')}
    >
      <article
        aria-label={ariaLabel}
        className={cn(
          'max-w-[min(85%,28rem)] rounded-xl border px-3 py-2 text-[13px] leading-relaxed',
          isInbound
            ? 'border-border/50 bg-muted/40 text-foreground'
            : 'border-[color:var(--brand)]/20 bg-[color:var(--brand)]/5 text-foreground',
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="sr-only">{directionLabel}</span>
          <span aria-hidden>{channelLabel}</span>
          <span aria-hidden>·</span>
          <time dateTime={occurredAt} className="tabular-nums">
            {timeLabel}
          </time>
        </div>

        {showMediaLabel && (
          <p className="font-medium text-foreground">{contentLabel}</p>
        )}

        {text ? (
          <p className={cn('whitespace-pre-wrap break-words', showMediaLabel && 'mt-1')}>{text}</p>
        ) : !showMediaLabel ? (
          <p className="text-muted-foreground italic">{contentLabel}</p>
        ) : null}

        {hasAttachments && attachmentCount > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('communication.timeline.attachments', { count: attachmentCount })}
          </p>
        )}

        {truncated && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('communication.timeline.messageShortened')}
          </p>
        )}
      </article>
    </div>
  );
}

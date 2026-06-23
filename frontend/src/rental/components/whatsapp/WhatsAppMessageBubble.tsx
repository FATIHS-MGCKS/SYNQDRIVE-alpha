import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { WhatsAppMsg } from '../../../lib/api';
import { deliveryStatusLabel, formatTime } from './whatsapp.ops';

interface WhatsAppMessageBubbleProps {
  msg: WhatsAppMsg;
}

export function WhatsAppMessageBubble({ msg }: WhatsAppMessageBubbleProps) {
  const isOutgoing = msg.direction === 'outgoing';
  const isAi = msg.senderType === 'ai' || msg.aiGenerated;
  const isSystem = msg.senderType === 'system';
  const failed = msg.status === 'FAILED';

  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-[var(--shadow-1)]',
          isSystem && 'bg-muted/50 text-muted-foreground',
          !isSystem && isOutgoing && isAi && 'bg-[color:var(--status-ai)]/12 text-foreground',
          !isSystem && isOutgoing && !isAi && 'bg-[color:var(--status-positive)]/12 text-foreground',
          !isSystem && !isOutgoing && 'border border-border/40 bg-card text-foreground',
          failed && 'ring-1 ring-[color:var(--status-critical)]/30',
        )}
      >
        {isAi && (
          <div className="mb-1 flex items-center gap-1">
            <Icon name="sparkles" className="h-3 w-3 text-[color:var(--status-ai)]" />
            <span className="text-[9px] font-semibold text-[color:var(--status-ai)]">
              SynqDrive AI
            </span>
          </div>
        )}
        {!isOutgoing && msg.senderName && !isAi && (
          <p className="mb-0.5 text-[9px] font-semibold text-[color:var(--status-positive)]">
            {msg.senderName}
          </p>
        )}
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{msg.content}</p>
        <div className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', isOutgoing && 'justify-end')}>
          <span className="text-[9px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
          {isOutgoing && (
            <StatusChip tone={failed ? 'critical' : msg.status === 'READ' ? 'success' : 'neutral'}>
              {deliveryStatusLabel(msg.status)}
            </StatusChip>
          )}
          {msg.aiSuggested && (
            <StatusChip tone="ai">
              Suggested
            </StatusChip>
          )}
        </div>
        {failed && msg.failureReason && (
          <p className="mt-1 text-[9px] text-[color:var(--status-critical)]">{msg.failureReason}</p>
        )}
      </div>
    </div>
  );
}

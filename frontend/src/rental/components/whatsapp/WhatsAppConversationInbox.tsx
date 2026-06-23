import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import type { WhatsAppConversation } from '../../../lib/api';
import {
  conversationDisplayName,
  formatRelativeTime,
  INBOX_FILTERS,
  type InboxFilter,
} from './whatsapp.ops';

interface WhatsAppConversationInboxProps {
  conversations: WhatsAppConversation[];
  selectedId: string | null;
  search: string;
  filter: InboxFilter;
  onSearchChange: (v: string) => void;
  onFilterChange: (f: InboxFilter) => void;
  onSelect: (c: WhatsAppConversation) => void;
}

export function WhatsAppConversationInbox({
  conversations,
  selectedId,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onSelect,
}: WhatsAppConversationInboxProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/40">
      <div className="space-y-2 border-b border-border/40 p-3">
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search name, phone, message…"
            className="w-full rounded-lg border border-border/60 bg-muted/30 py-2 pl-8 pr-3 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-[color:var(--brand)]/30"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {INBOX_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              title={f.needsIntent ? 'Requires backend intent detection' : undefined}
              onClick={() => onFilterChange(f.key)}
              className={cn(
                'sq-press rounded-md px-2 py-1 text-[9px] font-semibold transition-all',
                filter === f.key
                  ? 'bg-[color:var(--brand)]/12 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/25'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground',
                f.needsIntent && 'opacity-80',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <EmptyState
            compact
            title="No conversations"
            description={
              filter !== 'all'
                ? 'Try another filter or wait for inbound messages.'
                : 'Inbound WhatsApp messages appear here once webhooks are active.'
            }
          />
        ) : (
          conversations.map(c => {
            const selected = c.id === selectedId;
            const name = conversationDisplayName(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className={cn(
                  'sq-press w-full border-b border-border/20 px-3 py-3 text-left transition-colors hover:bg-muted/30',
                  selected && 'bg-[color:var(--brand)]/[0.06]',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--status-positive)]/10 text-[10px] font-bold text-[color:var(--status-positive)]">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-foreground">{name}</span>
                      {c.lastMessageAt && (
                        <span className="shrink-0 text-[9px] text-muted-foreground">
                          {formatRelativeTime(c.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {c.lastMessagePreview || 'No messages yet'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {c.unreadCount > 0 && (
                        <span className="rounded-md bg-[color:var(--status-positive)] px-1.5 py-0.5 text-[8px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                      {c.status === 'PENDING_HUMAN' && (
                        <StatusChip tone="watch">
                          Handover
                        </StatusChip>
                      )}
                      {!c.customerId && (
                        <StatusChip tone="neutral">
                          Unknown
                        </StatusChip>
                      )}
                      {c.bookingId && (
                        <StatusChip tone="info">
                          Booking
                        </StatusChip>
                      )}
                      {c.intent && (
                        <StatusChip tone="info">
                          {c.intent}
                        </StatusChip>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

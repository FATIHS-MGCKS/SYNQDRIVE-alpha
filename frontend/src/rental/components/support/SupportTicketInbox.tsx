import type { ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { StatusChip } from '../../../components/patterns/status';
import { supportStatusTone } from '../../../components/patterns/status-utils';
import { EmptyState, ErrorState, SkeletonRows } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '../../../lib/api';
import {
  DEFAULT_TICKET_FILTERS,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_STATUS_LABEL,
  formatRelativeTime,
  getLastMessagePreview,
  getLastSenderLabel,
  getTicketCode,
  isWaitingOnUser,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  relatedEntityLabel,
  sp,
  supportPriorityTone,
  type SupportTicketFilters,
} from './support-center.utils';

interface SupportTicketInboxProps {
  tickets: SupportTicket[];
  selectedId: string | null;
  loading?: boolean;
  error?: string | null;
  filters: SupportTicketFilters;
  onFiltersChange: (filters: SupportTicketFilters) => void;
  onSelect: (ticket: SupportTicket) => void;
  onCreateTicket: () => void;
  onRetry?: () => void;
  hasAnyTickets: boolean;
}

const STATUS_OPTIONS: Array<SupportTicketStatus | 'all'> = [
  'all',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'RESOLVED',
  'CLOSED',
];

const CATEGORY_OPTIONS: Array<SupportTicketCategory | 'all'> = [
  'all',
  'APP',
  'VEHICLE',
  'BOOKING',
  'BILLING',
  'DIMO_TELEMETRY',
  'ACCOUNT',
  'DOCUMENTS',
  'DATA_AUTHORIZATION',
  'HEALTH',
  'OTHER',
];

const PRIORITY_OPTIONS: Array<SupportTicketPriority | 'all'> = ['all', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function SupportTicketInbox({
  tickets,
  selectedId,
  loading,
  error,
  filters,
  onFiltersChange,
  onSelect,
  onCreateTicket,
  onRetry,
  hasAnyTickets,
}: SupportTicketInboxProps) {
  const set = <K extends keyof SupportTicketFilters>(key: K, value: SupportTicketFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.priority !== 'all' ||
    filters.openOnly ||
    filters.waitingOnMe;

  return (
    <div className={cn(sp.inboxPanel, 'flex flex-col min-h-[420px]')}>
      <div className="border-b border-border/40 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Deine Tickets</p>
            <p className="text-[11px] text-muted-foreground">{tickets.length} Einträge</p>
          </div>
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Ticket suchen…"
            aria-label="Eigene Support-Tickets durchsuchen"
            className="w-full rounded-xl border border-border/60 bg-background/80 py-2.5 pl-10 pr-3 text-xs outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand)_15%,transparent)]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => set('status', v as SupportTicketStatus | 'all')}
            options={STATUS_OPTIONS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle Status' : SUPPORT_STATUS_LABEL[v],
            }))}
          />
          <FilterSelect
            label="Kategorie"
            value={filters.category}
            onChange={(v) => set('category', v as SupportTicketCategory | 'all')}
            options={CATEGORY_OPTIONS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle Kategorien' : SUPPORT_CATEGORY_LABEL[v],
            }))}
          />
          <FilterSelect
            label="Priorität"
            value={filters.priority}
            onChange={(v) => set('priority', v as SupportTicketPriority | 'all')}
            options={PRIORITY_OPTIONS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle Prioritäten' : SUPPORT_PRIORITY_LABEL[v],
            }))}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ToggleChip active={filters.openOnly} onClick={() => set('openOnly', !filters.openOnly)}>
            Nur offene
          </ToggleChip>
          <ToggleChip active={filters.waitingOnMe} onClick={() => set('waitingOnMe', !filters.waitingOnMe)}>
            Wartet auf mich
          </ToggleChip>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => onFiltersChange(DEFAULT_TICKET_FILTERS)}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : error ? (
          <ErrorState
            compact
            title="Tickets konnten nicht geladen werden"
            description={error}
            onRetry={onRetry}
            retryLabel="Erneut versuchen"
          />
        ) : tickets.length === 0 ? (
          hasAnyTickets ? (
            <EmptyState
              compact
              title="Keine Tickets gefunden"
              description="Passe die Filter an oder setze sie zurück."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => onFiltersChange(DEFAULT_TICKET_FILTERS)}>
                  Filter zurücksetzen
                </Button>
              }
            />
          ) : (
            <EmptyState
              compact
              title="Noch keine Support Tickets"
              description="Erstelle dein erstes Ticket — wir melden uns im Thread bei dir."
              action={
                <Button type="button" size="sm" onClick={onCreateTicket}>
                  Erstes Ticket erstellen
                </Button>
              }
            />
          )
        ) : (
          <div>
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                active={selectedId === ticket.id}
                onSelect={() => onSelect(ticket)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2 py-1">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[120px] bg-transparent text-[11px] font-medium text-foreground outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-[color:color-mix(in_srgb,var(--brand)_30%,transparent)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
          : 'border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TicketRow({
  ticket,
  active,
  onSelect,
}: {
  ticket: SupportTicket;
  active: boolean;
  onSelect: () => void;
}) {
  const status = normalizeStatusKey(ticket);
  const priority = normalizePriorityKey(ticket);
  const category = normalizeCategoryKey(ticket);
  const waiting = isWaitingOnUser(ticket);
  const related = relatedEntityLabel(ticket.relatedEntityType ?? null, ticket.relatedEntityId);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(sp.ticketRow, active && sp.ticketRowActive, 'animate-fade-up')}
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-[10px] font-bold text-muted-foreground">
        #{ticket.ticketNumber}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-foreground">{ticket.subject}</span>
          {waiting && (
            <StatusChip tone="watch" className="text-[10px]">
              {ticket.unreadForUser ? 'Neue Antwort' : 'Wartet auf dich'}
            </StatusChip>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusChip tone={supportStatusTone(status)} dot className="text-[10px]">
            {SUPPORT_STATUS_LABEL[status]}
          </StatusChip>
          <StatusChip tone="neutral" className="text-[10px]">
            {SUPPORT_CATEGORY_LABEL[category]}
          </StatusChip>
          <StatusChip tone={supportPriorityTone(priority)} className="text-[10px]">
            {SUPPORT_PRIORITY_LABEL[priority]}
          </StatusChip>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {getLastMessagePreview(ticket)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{getTicketCode(ticket)}</span>
          <span>·</span>
          <span>{formatRelativeTime(ticket.lastMessageAt || ticket.lastActivityAt || ticket.createdAt)}</span>
          <span>·</span>
          <span>{getLastSenderLabel(ticket)}</span>
          {related && (
            <>
              <span>·</span>
              <span>{related}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

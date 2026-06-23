import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { StatusChip } from '../../../components/patterns/status';
import { supportStatusTone } from '../../../components/patterns/status-utils';
import { EmptyState, ErrorState, SkeletonRows } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '../../../lib/api';
import {
  DEFAULT_INBOX_FILTERS,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_LABEL,
  formatRelativeTime,
  getLastMessagePreview,
  getTicketCode,
  hasActiveInboxFilters,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  relatedEntityLabel,
  sop,
  supportPriorityTone,
  supportStatusLabel,
  type SupportInboxFilters,
} from './support-ops.utils';

interface OrgOption {
  id: string;
  name: string;
}

interface AssigneeOption {
  id: string;
  name: string;
}

interface SupportOpsInboxProps {
  tickets: SupportTicket[];
  selectedId: string | null;
  loading?: boolean;
  error?: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  filters: SupportInboxFilters;
  onFiltersChange: (filters: SupportInboxFilters) => void;
  organizations: OrgOption[];
  assignees: AssigneeOption[];
  orgNameById: (id: string) => string;
  onSelect: (ticket: SupportTicket) => void;
  onRetry: () => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

const STATUS_OPTS: Array<SupportTicketStatus | 'all'> = [
  'all',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'RESOLVED',
  'CLOSED',
];

const PRIORITY_OPTS: Array<SupportTicketPriority | 'all'> = ['all', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const CATEGORY_OPTS: Array<SupportTicketCategory | 'all'> = [
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

const INPUT =
  'w-full rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 text-[11px] outline-none focus:border-[color:var(--brand)]';

export function SupportOpsInbox({
  tickets,
  selectedId,
  loading,
  error,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  organizations,
  assignees,
  orgNameById,
  onSelect,
  onRetry,
  page,
  totalPages,
  total,
  onPageChange,
  onRefresh,
}: SupportOpsInboxProps) {
  const set = <K extends keyof SupportInboxFilters>(key: K, value: SupportInboxFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const filtersActive = hasActiveInboxFilters(filters, search);

  return (
    <section className={cn(sop.inboxCol, 'min-h-[480px]')}>
      <div className="border-b border-border/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Inbox</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{total} Tickets</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={loading} aria-label="Inbox aktualisieren">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Suche Betreff, E-Mail, Ticketnr…"
            aria-label="Support-Tickets durchsuchen"
            className={cn(INPUT, 'pl-8')}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          <FilterSelect
            label="Organisation"
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
            options={[
              { value: '', label: 'Alle' },
              ...organizations.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => set('status', v as SupportTicketStatus | 'all')}
            options={STATUS_OPTS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle' : supportStatusLabel(v, 'admin'),
            }))}
          />
          <FilterSelect
            label="Priorität"
            value={filters.priority}
            onChange={(v) => set('priority', v as SupportTicketPriority | 'all')}
            options={PRIORITY_OPTS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle' : SUPPORT_PRIORITY_LABEL[v],
            }))}
          />
          <FilterSelect
            label="Kategorie"
            value={filters.category}
            onChange={(v) => set('category', v as SupportTicketCategory | 'all')}
            options={CATEGORY_OPTS.map((v) => ({
              value: v,
              label: v === 'all' ? 'Alle' : SUPPORT_CATEGORY_LABEL[v],
            }))}
          />
          <FilterSelect
            label="Assignee"
            value={filters.assigneeId}
            onChange={(v) => set('assigneeId', v)}
            options={[
              { value: '', label: 'Alle' },
              ...assignees.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
          <div className="col-span-2 grid grid-cols-2 gap-2 xl:col-span-1">
            <label className="block">
              <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Von</span>
              <input type="date" value={filters.createdFrom} onChange={(e) => set('createdFrom', e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Bis</span>
              <input type="date" value={filters.createdTo} onChange={(e) => set('createdTo', e.target.value)} className={INPUT} />
            </label>
          </div>
        </div>

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              onFiltersChange(DEFAULT_INBOX_FILTERS);
              onSearchChange('');
            }}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && tickets.length === 0 ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : error ? (
          <ErrorState compact title="Tickets konnten nicht geladen werden" description={error} onRetry={onRetry} retryLabel="Erneut versuchen" />
        ) : tickets.length === 0 ? (
          <EmptyState
            compact
            title={filtersActive ? 'Keine Suchergebnisse' : 'Keine Tickets in dieser Queue'}
            description={filtersActive ? 'Passe Suche oder Filter an.' : 'Diese Queue ist aktuell leer.'}
          />
        ) : (
          tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              orgName={orgNameById(ticket.organizationId)}
              active={selectedId === ticket.id}
              onSelect={() => onSelect(ticket)}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            Seite {page} / {totalPages}
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={page >= totalPages || loading} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
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
    <label className="block min-w-0">
      <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(INPUT, 'truncate')}>
        {options.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TicketRow({
  ticket,
  orgName,
  active,
  onSelect,
}: {
  ticket: SupportTicket;
  orgName: string;
  active: boolean;
  onSelect: () => void;
}) {
  const status = normalizeStatusKey(ticket);
  const priority = normalizePriorityKey(ticket);
  const category = normalizeCategoryKey(ticket);
  const related = relatedEntityLabel(ticket.relatedEntityType ?? null, ticket.relatedEntityId);
  const critical = priority === 'CRITICAL';

  return (
    <button type="button" onClick={onSelect} className={cn(sop.ticketRow, active && sop.ticketRowActive)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold text-[color:var(--brand)] tabular-nums">{getTicketCode(ticket)}</span>
            {ticket.unreadForAdmin && (
              <StatusChip tone="watch" className="text-[9px] px-1.5 py-0">
                Ungelesen
              </StatusChip>
            )}
            {critical && (
              <StatusChip tone="critical" className="text-[9px] px-1.5 py-0">
                Kritisch
              </StatusChip>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground">{ticket.subject}</p>
          <p className="truncate text-[10px] text-muted-foreground">{orgName}</p>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatRelativeTime(ticket.lastMessageAt || ticket.lastActivityAt || ticket.createdAt)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <StatusChip tone={supportStatusTone(status)} dot className="text-[9px]">
          {supportStatusLabel(status, 'admin')}
        </StatusChip>
        <StatusChip tone="neutral" className="text-[9px]">
          {SUPPORT_CATEGORY_LABEL[category]}
        </StatusChip>
        <StatusChip tone={supportPriorityTone(priority)} className="text-[9px]">
          {SUPPORT_PRIORITY_LABEL[priority]}
        </StatusChip>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{getLastMessagePreview(ticket)}</p>
      <p className="mt-1 text-[9px] text-muted-foreground">
        {ticket.reporterName || ticket.reporterEmail}
        {related ? ` · ${related}` : ''}
      </p>
    </button>
  );
}

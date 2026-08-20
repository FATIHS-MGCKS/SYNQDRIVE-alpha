import type {
  SupportTicket,
  SupportTicketListParams,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '../../../lib/api';
import {
  getTicketCode,
  isKnownSupportCategory,
  isKnownSupportPriority,
  isKnownSupportStatus,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  supportPriorityTone,
} from '../../../rental/components/support/support-center.utils';
import {
  formatSupportRelativeTime,
  getLocalizedLastMessagePreview,
  getLocalizedLastSenderLabel,
  labelMessageSender,
  labelRelatedEntity,
  labelSupportCategory,
  labelSupportPriority,
  labelSupportStatus,
} from '../../../rental/components/support/support-i18n';

/** Master Support Ops still uses German presentation until a dedicated master i18n slice. */
const MASTER_SUPPORT_LOCALE = 'de';

export function supportStatusLabel(
  status: SupportTicketStatus,
  perspective: 'user' | 'admin' = 'user',
): string {
  return labelSupportStatus(MASTER_SUPPORT_LOCALE, status, perspective);
}

export function getMessageSenderLabel(
  message: { senderRole?: string; senderName?: string },
  perspective: 'user' | 'admin' = 'user',
): string {
  return labelMessageSender(MASTER_SUPPORT_LOCALE, message, perspective);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  return formatSupportRelativeTime(MASTER_SUPPORT_LOCALE, iso);
}

export function getLastMessagePreview(ticket: SupportTicket): string {
  return getLocalizedLastMessagePreview(MASTER_SUPPORT_LOCALE, ticket);
}

export function getLastSenderLabel(ticket: SupportTicket): string {
  return getLocalizedLastSenderLabel(MASTER_SUPPORT_LOCALE, ticket);
}

export function relatedEntityLabel(
  type: SupportTicketRelatedEntityType | null | undefined,
  id?: string | null,
): string | null {
  return labelRelatedEntity(MASTER_SUPPORT_LOCALE, type, id);
}

function buildStatusLabelRecord(): Record<SupportTicketStatus, string> {
  const statuses: SupportTicketStatus[] = [
    'OPEN',
    'IN_PROGRESS',
    'WAITING_FOR_CUSTOMER',
    'RESOLVED',
    'CLOSED',
  ];
  return Object.fromEntries(
    statuses.map((status) => [status, labelSupportStatus(MASTER_SUPPORT_LOCALE, status)]),
  ) as Record<SupportTicketStatus, string>;
}

function buildCategoryLabelRecord(): Record<SupportTicketCategory, string> {
  const categories: SupportTicketCategory[] = [
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
  return Object.fromEntries(
    categories.map((category) => [category, labelSupportCategory(MASTER_SUPPORT_LOCALE, category)]),
  ) as Record<SupportTicketCategory, string>;
}

function buildPriorityLabelRecord(): Record<SupportTicketPriority, string> {
  const priorities: SupportTicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
  return Object.fromEntries(
    priorities.map((priority) => [priority, labelSupportPriority(MASTER_SUPPORT_LOCALE, priority)]),
  ) as Record<SupportTicketPriority, string>;
}

export const SUPPORT_STATUS_LABEL = buildStatusLabelRecord();
export const SUPPORT_CATEGORY_LABEL = buildCategoryLabelRecord();
export const SUPPORT_PRIORITY_LABEL = buildPriorityLabelRecord();

export {
  getTicketCode,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  supportPriorityTone,
  isKnownSupportCategory,
  isKnownSupportPriority,
  isKnownSupportStatus,
};

export const sop = {
  shell: 'flex flex-col gap-3 min-h-[calc(100vh-8rem)]',
  kpiStrip: 'surface-premium surface-frosted rounded-xl border border-border/45 px-3 py-2 shadow-[var(--shadow-1)]',
  queueCol:
    'hidden lg:flex lg:flex-col lg:w-[188px] shrink-0 surface-premium rounded-xl border border-border/45 surface-premium/90 overflow-hidden',
  inboxCol: 'flex min-w-0 flex-1 flex-col surface-premium rounded-xl border border-border/45 surface-frosted overflow-hidden',
  workspaceCol:
    'hidden xl:flex xl:w-[min(440px,34vw)] shrink-0 flex-col surface-premium rounded-xl border border-border/45 surface-frosted overflow-hidden',
  queueBtn:
    'w-full text-left px-3 py-2 text-[11px] font-medium transition-colors border-l-2 border-transparent hover:bg-muted/40 hover:text-foreground',
  queueBtnActive:
    'bg-[color:var(--brand-soft)] text-[color:var(--brand)] border-l-[color:var(--brand)] font-semibold',
  ticketRow:
    'w-full text-left px-3 py-3 border-b border-border/30 last:border-b-0 transition-colors hover:bg-muted/25',
  ticketRowActive:
    'bg-[color:var(--brand-soft)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]',
} as const;

export type SupportQueueId =
  | 'all_open'
  | 'new'
  | 'critical'
  | 'waiting_support'
  | 'waiting_customer'
  | 'mine'
  | 'unread'
  | 'resolved'
  | 'closed';

export interface SupportQueueItem {
  id: SupportQueueId;
  label: string;
  hint?: string;
}

export const SUPPORT_QUEUES: SupportQueueItem[] = [
  { id: 'all_open', label: 'Alle offenen' },
  { id: 'new', label: 'Neue Tickets' },
  { id: 'critical', label: 'Kritisch', hint: 'Offen + kritisch' },
  { id: 'waiting_support', label: 'Wartet auf Support' },
  { id: 'waiting_customer', label: 'Wartet auf Kunde' },
  { id: 'mine', label: 'Meine Tickets' },
  { id: 'unread', label: 'Ungelesen' },
  { id: 'resolved', label: 'Gelöst' },
  { id: 'closed', label: 'Geschlossen' },
];

export interface SupportInboxFilters {
  organizationId: string;
  status: SupportTicketStatus | 'all';
  priority: SupportTicketPriority | 'all';
  category: SupportTicketCategory | 'all';
  assigneeId: string;
  createdFrom: string;
  createdTo: string;
}

export const DEFAULT_INBOX_FILTERS: SupportInboxFilters = {
  organizationId: '',
  status: 'all',
  priority: 'all',
  category: 'all',
  assigneeId: '',
  createdFrom: '',
  createdTo: '',
};

export const PAGE_SIZE = 25;

export function buildTicketListParams(
  queue: SupportQueueId,
  filters: SupportInboxFilters,
  search: string,
  page: number,
  currentUserId?: string,
): SupportTicketListParams {
  const params: SupportTicketListParams = {
    page: String(page),
    limit: String(PAGE_SIZE),
  };

  const q = search.trim();
  if (q) params.search = q;
  if (filters.organizationId) params.organizationId = filters.organizationId;
  if (filters.priority !== 'all') params.priority = filters.priority;
  if (filters.category !== 'all') params.category = filters.category;
  if (filters.createdFrom) params.createdFrom = new Date(filters.createdFrom).toISOString();
  if (filters.createdTo) {
    const end = new Date(filters.createdTo);
    end.setHours(23, 59, 59, 999);
    params.createdTo = end.toISOString();
  }

  if (filters.status !== 'all') {
    params.status = filters.status;
  } else {
    switch (queue) {
      case 'all_open':
        params.openOnly = 'true';
        break;
      case 'new':
        params.status = 'OPEN';
        break;
      case 'critical':
        params.openOnly = 'true';
        params.priority = 'CRITICAL';
        break;
      case 'waiting_support':
        params.openOnly = 'true';
        params.hasUnread = 'true';
        break;
      case 'waiting_customer':
        params.status = 'WAITING_FOR_CUSTOMER';
        break;
      case 'mine':
        if (currentUserId) params.assignedToUserId = currentUserId;
        break;
      case 'unread':
        params.hasUnread = 'true';
        break;
      case 'resolved':
        params.status = 'RESOLVED';
        break;
      case 'closed':
        params.status = 'CLOSED';
        break;
    }
  }

  if (filters.assigneeId) params.assignedToUserId = filters.assigneeId;

  return params;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0 || !Number.isFinite(ms)) return '—';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return '< 1 min';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isTerminalStatus(status: SupportTicketStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}

export function hasActiveInboxFilters(filters: SupportInboxFilters, search: string): boolean {
  return (
    search.trim() !== '' ||
    filters.organizationId !== '' ||
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.category !== 'all' ||
    filters.assigneeId !== '' ||
    filters.createdFrom !== '' ||
    filters.createdTo !== ''
  );
}

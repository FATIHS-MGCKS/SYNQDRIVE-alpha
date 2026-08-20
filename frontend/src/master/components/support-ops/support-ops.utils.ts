import type {
  SupportTicketListParams,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';
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

export type SupportQueueDef = {
  id: SupportQueueId;
  labelKey: TranslationKey;
  hintKey?: TranslationKey;
};

export const SUPPORT_QUEUE_DEFS: SupportQueueDef[] = [
  { id: 'all_open', labelKey: 'support.ops.queue.allOpen' },
  { id: 'new', labelKey: 'support.ops.queue.new' },
  {
    id: 'critical',
    labelKey: 'support.ops.queue.critical',
    hintKey: 'support.ops.queue.criticalHint',
  },
  { id: 'waiting_support', labelKey: 'support.ops.queue.waitingSupport' },
  { id: 'waiting_customer', labelKey: 'support.ops.queue.waitingCustomer' },
  { id: 'mine', labelKey: 'support.ops.queue.mine' },
  { id: 'unread', labelKey: 'support.ops.queue.unread' },
  { id: 'resolved', labelKey: 'support.ops.queue.resolved' },
  { id: 'closed', labelKey: 'support.ops.queue.closed' },
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

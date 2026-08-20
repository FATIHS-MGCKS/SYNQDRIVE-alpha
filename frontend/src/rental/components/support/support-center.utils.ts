import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns/status-utils';
import type { TranslationKey } from '../../../i18n/translations/en';
import { buildTechnicalMetadata as buildSharedTechnicalMetadata } from '../../../components/support/support-metadata';

const VALID_SUPPORT_STATUSES = new Set<SupportTicketStatus>([
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'RESOLVED',
  'CLOSED',
]);

const VALID_SUPPORT_PRIORITIES = new Set<SupportTicketPriority>(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);

const VALID_SUPPORT_CATEGORIES = new Set<SupportTicketCategory>([
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
]);

export function isKnownSupportStatus(status: string): status is SupportTicketStatus {
  return VALID_SUPPORT_STATUSES.has(status as SupportTicketStatus);
}

export function isKnownSupportPriority(priority: string): priority is SupportTicketPriority {
  return VALID_SUPPORT_PRIORITIES.has(priority as SupportTicketPriority);
}

export function isKnownSupportCategory(category: string): category is SupportTicketCategory {
  return VALID_SUPPORT_CATEGORIES.has(category as SupportTicketCategory);
}

/** Shared UI tokens for Rental → Support Center. */
export const sp = {
  shell: 'space-y-5 max-w-[1400px] mx-auto',
  glassPanel: 'surface-premium rounded-2xl overflow-hidden',
  inboxPanel: 'surface-premium rounded-2xl min-w-0 overflow-hidden',
  detailPanel:
    'surface-premium rounded-2xl flex flex-col min-h-0 overflow-hidden',
  quickCard:
    'group surface-elevated rounded-xl p-3.5 text-left transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
  ticketRow:
    'w-full text-left px-4 py-3.5 flex gap-3 transition-colors border-b border-border/30 last:border-b-0 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
  ticketRowActive: 'bg-[color:var(--brand-soft)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--brand)_20%,transparent)]',
} as const;

export type QuickIssueCardDef = {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  category: SupportTicketCategory;
  icon: string;
};

export const QUICK_ISSUE_CARD_DEFS: QuickIssueCardDef[] = [
  {
    id: 'app',
    titleKey: 'support.quickIssue.app.title',
    descriptionKey: 'support.quickIssue.app.description',
    category: 'APP',
    icon: 'smartphone',
  },
  {
    id: 'vehicle',
    titleKey: 'support.quickIssue.vehicle.title',
    descriptionKey: 'support.quickIssue.vehicle.description',
    category: 'VEHICLE',
    icon: 'car',
  },
  {
    id: 'dimo',
    titleKey: 'support.quickIssue.dimo.title',
    descriptionKey: 'support.quickIssue.dimo.description',
    category: 'DIMO_TELEMETRY',
    icon: 'map-pin',
  },
  {
    id: 'booking',
    titleKey: 'support.quickIssue.booking.title',
    descriptionKey: 'support.quickIssue.booking.description',
    category: 'BOOKING',
    icon: 'calendar',
  },
  {
    id: 'billing',
    titleKey: 'support.quickIssue.billing.title',
    descriptionKey: 'support.quickIssue.billing.description',
    category: 'BILLING',
    icon: 'receipt',
  },
  {
    id: 'documents',
    titleKey: 'support.quickIssue.documents.title',
    descriptionKey: 'support.quickIssue.documents.description',
    category: 'DOCUMENTS',
    icon: 'file-text',
  },
  {
    id: 'account',
    titleKey: 'support.quickIssue.account.title',
    descriptionKey: 'support.quickIssue.account.description',
    category: 'ACCOUNT',
    icon: 'user',
  },
  {
    id: 'other',
    titleKey: 'support.quickIssue.other.title',
    descriptionKey: 'support.quickIssue.other.description',
    category: 'OTHER',
    icon: 'help-circle',
  },
];

export const OPEN_STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'];

export function normalizeStatusKey(ticket: SupportTicket): SupportTicketStatus {
  const key = String(ticket.statusKey ?? ticket.status ?? 'OPEN').toUpperCase().replace(/\s+/g, '_');
  if (key === 'WAITING') return 'WAITING_FOR_CUSTOMER';
  if (isKnownSupportStatus(key)) return key;
  return 'OPEN';
}

export function normalizePriorityKey(ticket: SupportTicket): SupportTicketPriority {
  const key = String(ticket.priorityKey ?? ticket.priority ?? 'NORMAL').toUpperCase();
  if (key === 'MEDIUM' || key === 'URGENT') return key === 'URGENT' ? 'CRITICAL' : 'NORMAL';
  if (isKnownSupportPriority(key)) return key;
  return 'NORMAL';
}

export function normalizeCategoryKey(ticket: SupportTicket): SupportTicketCategory {
  const key = String(ticket.category ?? 'OTHER').toUpperCase();
  if (isKnownSupportCategory(key)) return key;
  return 'OTHER';
}

export function supportPriorityTone(priority: SupportTicketPriority): StatusTone {
  if (priority === 'CRITICAL') return 'critical';
  if (priority === 'HIGH') return 'watch';
  if (priority === 'NORMAL') return 'info';
  return 'neutral';
}

export function isTicketClosed(ticket: SupportTicket): boolean {
  const status = normalizeStatusKey(ticket);
  return status === 'RESOLVED' || status === 'CLOSED';
}

export function isWaitingOnUser(ticket: SupportTicket): boolean {
  if (ticket.unreadForUser) return true;
  const status = normalizeStatusKey(ticket);
  if (status === 'WAITING_FOR_CUSTOMER') return true;
  const role = String(ticket.lastMessageByRole ?? '').toLowerCase();
  return role === 'admin' || role === 'master_admin';
}

export function getTicketCode(ticket: SupportTicket): string {
  if (ticket.ticketCode) return ticket.ticketCode;
  return `SQD-${ticket.ticketNumber}`;
}

export interface SupportTicketFilters {
  search: string;
  status: SupportTicketStatus | 'all';
  category: SupportTicketCategory | 'all';
  priority: SupportTicketPriority | 'all';
  openOnly: boolean;
  waitingOnMe: boolean;
}

export const DEFAULT_TICKET_FILTERS: SupportTicketFilters = {
  search: '',
  status: 'all',
  category: 'all',
  priority: 'all',
  openOnly: false,
  waitingOnMe: false,
};

export function filterTickets(tickets: SupportTicket[], filters: SupportTicketFilters): SupportTicket[] {
  const q = filters.search.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const status = normalizeStatusKey(ticket);
    const priority = normalizePriorityKey(ticket);
    const category = normalizeCategoryKey(ticket);
    const code = getTicketCode(ticket).toLowerCase();

    if (q) {
      const hay = `${ticket.subject} ${ticket.description} ${code} #${ticket.ticketNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.status !== 'all' && status !== filters.status) return false;
    if (filters.category !== 'all' && category !== filters.category) return false;
    if (filters.priority !== 'all' && priority !== filters.priority) return false;
    if (filters.openOnly && !OPEN_STATUSES.includes(status)) return false;
    if (filters.waitingOnMe && !isWaitingOnUser(ticket)) return false;
    return true;
  });
}

export interface SupportCenterStats {
  openCount: number;
  waitingOnYouCount: number;
  lastSupportReplyAt: string | null;
  resolvedCount: number;
}

export function computeSupportStats(tickets: SupportTicket[]): SupportCenterStats {
  let lastSupportReplyAt: string | null = null;

  for (const ticket of tickets) {
    for (const msg of ticket.messages ?? []) {
      if (msg.senderRole === 'admin') {
        if (!lastSupportReplyAt || new Date(msg.createdAt) > new Date(lastSupportReplyAt)) {
          lastSupportReplyAt = msg.createdAt;
        }
      }
    }
    const role = String(ticket.lastMessageByRole ?? '').toLowerCase();
    const at = ticket.lastMessageAt || ticket.lastActivityAt;
    if ((role === 'admin' || role === 'master_admin') && at) {
      if (!lastSupportReplyAt || new Date(at) > new Date(lastSupportReplyAt)) {
        lastSupportReplyAt = at;
      }
    }
  }

  return {
    openCount: tickets.filter((t) => OPEN_STATUSES.includes(normalizeStatusKey(t))).length,
    waitingOnYouCount: tickets.filter((t) => isWaitingOnUser(t) && !isTicketClosed(t)).length,
    lastSupportReplyAt,
    resolvedCount: tickets.filter((t) => {
      const s = normalizeStatusKey(t);
      return s === 'RESOLVED' || s === 'CLOSED';
    }).length,
  };
}

export function buildTechnicalMetadata(extra?: Record<string, unknown>): Record<string, unknown> {
  return buildSharedTechnicalMetadata(extra);
}

export type { SupportTicketRelatedEntityType };

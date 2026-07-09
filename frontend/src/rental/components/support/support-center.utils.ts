import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { buildTechnicalMetadata as buildSharedTechnicalMetadata } from '../../../components/support/support-metadata';

/** Shared UI tokens for Rental → Support Center. */
export const sp = {
  shell: 'space-y-5 max-w-[1400px] mx-auto',
  glassPanel:
    'surface-premium rounded-2xl border border-border/45 shadow-[var(--shadow-1)]',
  inboxPanel: 'surface-premium rounded-2xl border border-border/45 min-w-0 overflow-hidden',
  detailPanel:
    'surface-premium rounded-2xl border border-border/45 flex flex-col min-h-0 overflow-hidden',
  quickCard:
    'group rounded-xl border border-border/40 bg-card/70 p-3.5 text-left transition-all duration-200 hover:bg-muted/30 hover:border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
  ticketRow:
    'w-full text-left px-4 py-3.5 flex gap-3 transition-colors border-b border-border/30 last:border-b-0 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
  ticketRowActive: 'bg-[color:var(--brand-soft)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--brand)_20%,transparent)]',
} as const;

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Neu',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING_FOR_CUSTOMER: 'Wartet auf deine Antwort',
  RESOLVED: 'Gelöst',
  CLOSED: 'Geschlossen',
};

/** Master/admin perspective — same labels except waiting status. */
export function supportStatusLabel(
  status: SupportTicketStatus,
  perspective: 'user' | 'admin' = 'user',
): string {
  if (perspective === 'admin' && status === 'WAITING_FOR_CUSTOMER') {
    return 'Wartet auf Kunde';
  }
  return SUPPORT_STATUS_LABEL[status];
}

export function getMessageSenderLabel(
  message: { senderRole?: string; senderName?: string },
  perspective: 'user' | 'admin' = 'user',
): string {
  const role = String(message.senderRole ?? '').toLowerCase();
  if (role === 'system') return 'System';
  if (role === 'admin' || role === 'master_admin') {
    if (perspective === 'admin') return message.senderName || 'SynqDrive Support';
    return 'SynqDrive Support';
  }
  if (perspective === 'admin') return message.senderName || 'Kunde';
  return message.senderName || 'Sie';
}

export const SUPPORT_PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  LOW: 'Niedrig',
  NORMAL: 'Normal',
  HIGH: 'Hoch',
  CRITICAL: 'Kritisch',
};

export const SUPPORT_PRIORITY_HINT: Record<SupportTicketPriority, string> = {
  LOW: 'Frage oder Hinweis',
  NORMAL: 'Normales Problem',
  HIGH: 'Operativ störend',
  CRITICAL: 'Betrieb stark beeinträchtigt',
};

export const SUPPORT_CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  APP: 'App',
  VEHICLE: 'Fahrzeug',
  BOOKING: 'Buchung',
  BILLING: 'Rechnung',
  DIMO_TELEMETRY: 'GPS / DIMO',
  ACCOUNT: 'Account',
  DOCUMENTS: 'Dokumente',
  DATA_AUTHORIZATION: 'Datenfreigabe',
  HEALTH: 'Fahrzeugzustand',
  OTHER: 'Sonstiges',
};

export type QuickIssueCard = {
  id: string;
  title: string;
  description: string;
  category: SupportTicketCategory;
  icon: string;
};

export const QUICK_ISSUE_CARDS: QuickIssueCard[] = [
  { id: 'app', title: 'App & Bedienung', description: 'Navigation, UI, Funktionen', category: 'APP', icon: 'smartphone' },
  { id: 'vehicle', title: 'Fahrzeug & Verfügbarkeit', description: 'Status, Zuweisung, Flotte', category: 'VEHICLE', icon: 'car' },
  { id: 'dimo', title: 'Live Map / GPS / DIMO', description: 'Telematik, Standort, Verbindung', category: 'DIMO_TELEMETRY', icon: 'map-pin' },
  { id: 'booking', title: 'Buchung & Kunde', description: 'Reservierungen, Kundendaten', category: 'BOOKING', icon: 'calendar' },
  { id: 'billing', title: 'Rechnung & Vertrag', description: 'Abrechnung, Tarife, Verträge', category: 'BILLING', icon: 'receipt' },
  { id: 'documents', title: 'Dokumente', description: 'Uploads, Verträge, Nachweise', category: 'DOCUMENTS', icon: 'file-text' },
  { id: 'account', title: 'Account & Benutzer', description: 'Zugang, Rollen, Organisation', category: 'ACCOUNT', icon: 'user' },
  { id: 'other', title: 'Sonstiges', description: 'Alles andere', category: 'OTHER', icon: 'help-circle' },
];

export const OPEN_STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'];

export function normalizeStatusKey(ticket: SupportTicket): SupportTicketStatus {
  const key = String(ticket.statusKey ?? ticket.status ?? 'OPEN').toUpperCase().replace(/\s+/g, '_');
  if (key === 'WAITING') return 'WAITING_FOR_CUSTOMER';
  if (key in SUPPORT_STATUS_LABEL) return key as SupportTicketStatus;
  return 'OPEN';
}

export function normalizePriorityKey(ticket: SupportTicket): SupportTicketPriority {
  const key = String(ticket.priorityKey ?? ticket.priority ?? 'NORMAL').toUpperCase();
  if (key === 'MEDIUM' || key === 'URGENT') return key === 'URGENT' ? 'CRITICAL' : 'NORMAL';
  if (key in SUPPORT_PRIORITY_LABEL) return key as SupportTicketPriority;
  return 'NORMAL';
}

export function normalizeCategoryKey(ticket: SupportTicket): SupportTicketCategory {
  const key = String(ticket.category ?? 'OTHER').toUpperCase();
  if (key in SUPPORT_CATEGORY_LABEL) return key as SupportTicketCategory;
  return 'OTHER';
}

export function supportPriorityTone(priority: SupportTicketPriority): StatusTone {
  if (priority === 'CRITICAL') return 'critical';
  if (priority === 'HIGH') return 'watch';
  if (priority === 'NORMAL') return 'info';
  return 'neutral';
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `Vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Vor ${diffH}h`;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export function getLastMessagePreview(ticket: SupportTicket): string {
  const msgs = ticket.messages ?? [];
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    const text = (last.body || last.content || '').trim();
    if (text) return text;
    if (last.imageUrl || (last.attachments?.length ?? 0) > 0) return 'Anhang';
  }
  return ticket.description?.trim() || 'Keine Nachrichtenvorschau';
}

export function getLastSenderLabel(ticket: SupportTicket): string {
  const msgs = ticket.messages ?? [];
  if (msgs.length > 0) {
    return getMessageSenderLabel(msgs[msgs.length - 1]!, 'user');
  }
  const role = String(ticket.lastMessageByRole ?? '').toLowerCase();
  if (role === 'admin' || role === 'master_admin') return 'SynqDrive Support';
  if (role === 'user') return 'Sie';
  if (role === 'system') return 'System';
  return ticket.reporterName || 'Sie';
}

export function relatedEntityLabel(
  type: SupportTicketRelatedEntityType | null | undefined,
  id?: string | null,
): string | null {
  if (!type) return null;
  const labels: Record<SupportTicketRelatedEntityType, string> = {
    VEHICLE: 'Fahrzeug',
    BOOKING: 'Buchung',
    INVOICE: 'Rechnung',
    CUSTOMER: 'Kunde',
    USER: 'Benutzer',
    AUTHORIZATION: 'Datenfreigabe',
    CONNECTIVITY: 'Konnektivität',
    HEALTH: 'Fahrzeugzustand',
    OTHER: 'Objekt',
  };
  const base = labels[type] ?? 'Objekt';
  return id ? `${base} · ${id.slice(0, 8)}…` : base;
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

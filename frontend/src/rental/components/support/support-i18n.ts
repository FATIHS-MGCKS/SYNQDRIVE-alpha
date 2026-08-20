/**
 * Canonical Rental Support Center copy helpers for non-React utilities.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '../../../lib/api';
import {
  QUICK_ISSUE_CARD_DEFS,
  type QuickIssueCardDef,
} from './support-center.utils';

export function resolveSupportLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function su(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveSupportLocale(locale), key, vars).text;
}

export const SUPPORT_STATUS_KEYS: Record<SupportTicketStatus, TranslationKey> = {
  OPEN: 'support.statusNew',
  IN_PROGRESS: 'support.statusInProgress',
  WAITING_FOR_CUSTOMER: 'support.statusWaitingForCustomer',
  RESOLVED: 'support.statusResolved',
  CLOSED: 'support.statusClosed',
};

export function labelSupportStatus(
  locale: string,
  status: SupportTicketStatus,
  perspective: 'user' | 'admin' = 'user',
): string {
  if (perspective === 'admin' && status === 'WAITING_FOR_CUSTOMER') {
    return su(locale, 'support.statusWaitingForCustomerAdmin');
  }
  return su(locale, SUPPORT_STATUS_KEYS[status]);
}

const SUPPORT_PRIORITY_KEYS: Record<SupportTicketPriority, TranslationKey> = {
  LOW: 'support.prioLow',
  NORMAL: 'support.prioNormal',
  HIGH: 'support.prioHigh',
  CRITICAL: 'support.prioCritical',
};

const SUPPORT_PRIORITY_HINT_KEYS: Record<SupportTicketPriority, TranslationKey> = {
  LOW: 'support.prioLowHint',
  NORMAL: 'support.prioNormalHint',
  HIGH: 'support.prioHighHint',
  CRITICAL: 'support.prioCriticalHint',
};

export function labelSupportPriority(locale: string, priority: SupportTicketPriority): string {
  return su(locale, SUPPORT_PRIORITY_KEYS[priority]);
}

export function labelSupportPriorityHint(locale: string, priority: SupportTicketPriority): string {
  return su(locale, SUPPORT_PRIORITY_HINT_KEYS[priority]);
}

const SUPPORT_CATEGORY_KEYS: Record<SupportTicketCategory, TranslationKey> = {
  APP: 'support.catApp',
  VEHICLE: 'support.catVehicle',
  BOOKING: 'support.catBooking',
  BILLING: 'support.catBilling',
  DIMO_TELEMETRY: 'support.catDimoTelemetry',
  ACCOUNT: 'support.catAccount',
  DOCUMENTS: 'support.catDocuments',
  DATA_AUTHORIZATION: 'support.catDataAuthorization',
  HEALTH: 'support.catHealth',
  OTHER: 'support.catOther',
};

export function labelSupportCategory(locale: string, category: SupportTicketCategory): string {
  return su(locale, SUPPORT_CATEGORY_KEYS[category]);
}

export function labelMessageSender(
  locale: string,
  message: { senderRole?: string; senderName?: string },
  perspective: 'user' | 'admin' = 'user',
): string {
  const role = String(message.senderRole ?? '').toLowerCase();
  if (role === 'system') return su(locale, 'support.senderSystem');
  if (role === 'admin' || role === 'master_admin') {
    if (perspective === 'admin') return message.senderName || su(locale, 'support.senderSupport');
    return su(locale, 'support.senderSupport');
  }
  if (perspective === 'admin') return message.senderName || su(locale, 'support.senderCustomer');
  return message.senderName || su(locale, 'support.senderYou');
}

const RELATED_ENTITY_KEYS: Record<SupportTicketRelatedEntityType, TranslationKey> = {
  VEHICLE: 'support.entityVehicle',
  BOOKING: 'support.entityBooking',
  INVOICE: 'support.entityInvoice',
  CUSTOMER: 'support.entityCustomer',
  USER: 'support.entityUser',
  AUTHORIZATION: 'support.entityAuthorization',
  CONNECTIVITY: 'support.entityConnectivity',
  HEALTH: 'support.entityHealth',
  OTHER: 'support.entityOther',
};

export function labelRelatedEntity(
  locale: string,
  type: SupportTicketRelatedEntityType | null | undefined,
  id?: string | null,
): string | null {
  if (!type) return null;
  const base = su(locale, RELATED_ENTITY_KEYS[type] ?? 'support.entityObject');
  return id ? `${base} · ${id.slice(0, 8)}…` : base;
}

function resolveDateLocale(locale: string): string {
  return resolveSupportLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

export function formatSupportRelativeTime(locale: string, iso: string | null | undefined): string {
  if (!iso) return su(locale, 'support.time.emDash');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return su(locale, 'support.time.emDash');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return su(locale, 'support.time.justNow');
  if (diffMin < 60) return su(locale, 'support.time.minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return su(locale, 'support.time.hoursAgo', { count: diffH });
  return d.toLocaleDateString(resolveDateLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSupportDateTime(locale: string, iso: string | null | undefined): string {
  if (!iso) return su(locale, 'support.time.emDash');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return su(locale, 'support.time.emDash');
  return d.toLocaleDateString(resolveDateLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getLocalizedLastMessagePreview(locale: string, ticket: SupportTicket): string {
  const msgs = ticket.messages ?? [];
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    const text = (last.body || last.content || '').trim();
    if (text) return text;
    if (last.imageUrl || (last.attachments?.length ?? 0) > 0) {
      return su(locale, 'support.previewAttachment');
    }
  }
  return ticket.description?.trim() || su(locale, 'support.previewNoMessage');
}

export function getLocalizedLastSenderLabel(locale: string, ticket: SupportTicket): string {
  const msgs = ticket.messages ?? [];
  if (msgs.length > 0) {
    return labelMessageSender(locale, msgs[msgs.length - 1]!, 'user');
  }
  const role = String(ticket.lastMessageByRole ?? '').toLowerCase();
  if (role === 'admin' || role === 'master_admin') return su(locale, 'support.senderSupport');
  if (role === 'user') return su(locale, 'support.senderYou');
  if (role === 'system') return su(locale, 'support.senderSystem');
  return ticket.reporterName || su(locale, 'support.senderYou');
}

export function localizedQuickIssueCards(locale: string) {
  return QUICK_ISSUE_CARD_DEFS.map((card) => ({
    id: card.id,
    category: card.category,
    icon: card.icon,
    title: su(locale, card.titleKey),
    description: su(locale, card.descriptionKey),
  }));
}

export type LocalizedQuickIssueCard = ReturnType<typeof localizedQuickIssueCards>[number];

export type { QuickIssueCardDef };

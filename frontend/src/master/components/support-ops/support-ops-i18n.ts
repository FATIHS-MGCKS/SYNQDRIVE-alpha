/**
 * Master Support Ops presentation helpers.
 * Master-owned — does not import Rental localization modules.
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
import { SUPPORT_QUEUE_DEFS, type SupportQueueDef, type SupportQueueId } from './support-ops.utils';

export function resolveSupportOpsLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function so(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveSupportOpsLocale(locale), key, vars).text;
}

const SUPPORT_STATUS_KEYS: Record<SupportTicketStatus, TranslationKey> = {
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
    return so(locale, 'support.statusWaitingForCustomerAdmin');
  }
  return so(locale, SUPPORT_STATUS_KEYS[status]);
}

const SUPPORT_PRIORITY_KEYS: Record<SupportTicketPriority, TranslationKey> = {
  LOW: 'support.prioLow',
  NORMAL: 'support.prioNormal',
  HIGH: 'support.prioHigh',
  CRITICAL: 'support.prioCritical',
};

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

export function labelSupportPriority(locale: string, priority: SupportTicketPriority): string {
  return so(locale, SUPPORT_PRIORITY_KEYS[priority]);
}

export function labelSupportCategory(locale: string, category: SupportTicketCategory): string {
  return so(locale, SUPPORT_CATEGORY_KEYS[category]);
}

export function labelMessageSender(
  locale: string,
  message: { senderRole?: string; senderName?: string },
  perspective: 'user' | 'admin' = 'user',
): string {
  const role = String(message.senderRole ?? '').toLowerCase();
  if (role === 'system') return so(locale, 'support.senderSystem');
  if (role === 'admin' || role === 'master_admin') {
    if (perspective === 'admin') return message.senderName || so(locale, 'support.senderSupport');
    return so(locale, 'support.senderSupport');
  }
  if (perspective === 'admin') return message.senderName || so(locale, 'support.senderCustomer');
  return message.senderName || so(locale, 'support.senderYou');
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
  const base = so(locale, RELATED_ENTITY_KEYS[type] ?? 'support.entityObject');
  return id ? `${base} · ${id.slice(0, 8)}…` : base;
}

function resolveDateLocale(locale: string): string {
  return resolveSupportOpsLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

export function formatSupportRelativeTime(locale: string, iso: string | null | undefined): string {
  if (!iso) return so(locale, 'support.time.emDash');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return so(locale, 'support.time.emDash');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return so(locale, 'support.time.justNow');
  if (diffMin < 60) return so(locale, 'support.time.minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return so(locale, 'support.time.hoursAgo', { count: diffH });
  return d.toLocaleDateString(resolveDateLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSupportDateTime(locale: string, iso: string | null | undefined): string {
  if (!iso) return so(locale, 'support.time.emDash');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return so(locale, 'support.time.emDash');
  return d.toLocaleString(resolveDateLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSupportOpsDurationMs(locale: string, ms: number | null | undefined): string {
  if (ms == null || ms <= 0 || !Number.isFinite(ms)) return so(locale, 'support.time.emDash');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return so(locale, 'support.ops.duration.hoursMinutes', { hours: h, minutes: m });
  if (m > 0) return so(locale, 'support.ops.duration.minutes', { count: m });
  return so(locale, 'support.ops.duration.subMinute');
}

export function getLocalizedLastMessagePreview(locale: string, ticket: SupportTicket): string {
  const msgs = ticket.messages ?? [];
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    const text = (last.body || last.content || '').trim();
    if (text) return text;
    if (last.imageUrl || (last.attachments?.length ?? 0) > 0) {
      return so(locale, 'support.previewAttachment');
    }
  }
  return ticket.description?.trim() || so(locale, 'support.previewNoMessage');
}

export function localizedSupportQueues(locale: string) {
  return SUPPORT_QUEUE_DEFS.map((queue) => ({
    id: queue.id,
    label: so(locale, queue.labelKey),
    hint: queue.hintKey ? so(locale, queue.hintKey) : undefined,
  }));
}

export type LocalizedSupportQueue = ReturnType<typeof localizedSupportQueues>[number];

export type { SupportQueueDef, SupportQueueId };

export { SUPPORT_STATUS_KEYS };

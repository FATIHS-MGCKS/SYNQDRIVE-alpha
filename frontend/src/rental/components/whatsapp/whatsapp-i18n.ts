/**
 * Canonical WhatsApp Business copy helpers for non-React utilities and ops label functions.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { WhatsAppConfig, WhatsAppStats, WhatsAppTemplate } from '../../../lib/api';
import {
  AI_MODE_DEFS,
  INBOX_FILTER_DEFS,
  NAV_ITEM_DEFS,
  TEMPLATE_CATEGORY_KEYS,
  type InboxFilter,
  type ReadinessCheckDef,
  type WhatsAppConnectionStatus,
  type WhatsAppTab,
  buildReadinessCheckDefs,
} from './whatsapp.ops';

export function resolveWhatsAppLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function wa(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveWhatsAppLocale(locale), key, vars).text;
}

const CONNECTION_STATUS_KEYS: Record<WhatsAppConnectionStatus, TranslationKey> = {
  connected: 'whatsapp.connection.connected',
  setup_required: 'whatsapp.connection.setupRequired',
  error: 'whatsapp.connection.error',
  disconnected: 'whatsapp.connection.disconnected',
};

export function labelConnectionStatus(locale: string, status: WhatsAppConnectionStatus): string {
  return wa(locale, CONNECTION_STATUS_KEYS[status]);
}

const DELIVERY_STATUS_KEYS: Record<string, TranslationKey> = {
  QUEUED: 'whatsapp.delivery.queued',
  SENT: 'whatsapp.delivery.sent',
  DELIVERED: 'whatsapp.delivery.delivered',
  READ: 'whatsapp.delivery.read',
  FAILED: 'whatsapp.delivery.failed',
};

export function labelDeliveryStatus(locale: string, status: string): string {
  return DELIVERY_STATUS_KEYS[status] ? wa(locale, DELIVERY_STATUS_KEYS[status]) : status;
}

const AI_MODE_KEY_MAP: Record<WhatsAppConfig['aiMode'], { labelKey: TranslationKey; descriptionKey: TranslationKey }> = {
  OFF: { labelKey: 'whatsapp.aiMode.off.label', descriptionKey: 'whatsapp.aiMode.off.description' },
  SUGGEST_ONLY: {
    labelKey: 'whatsapp.aiMode.suggest_only.label',
    descriptionKey: 'whatsapp.aiMode.suggest_only.description',
  },
  AUTO_SIMPLE: {
    labelKey: 'whatsapp.aiMode.auto_simple.label',
    descriptionKey: 'whatsapp.aiMode.auto_simple.description',
  },
  FULL: { labelKey: 'whatsapp.aiMode.full.label', descriptionKey: 'whatsapp.aiMode.full.description' },
};

export function labelAiMode(locale: string, mode: WhatsAppConfig['aiMode']): string {
  return wa(locale, AI_MODE_KEY_MAP[mode].labelKey);
}

export function labelAiModeDescription(locale: string, mode: WhatsAppConfig['aiMode']): string {
  return wa(locale, AI_MODE_KEY_MAP[mode].descriptionKey);
}

export function localizedAiModeMeta(locale: string) {
  return (Object.keys(AI_MODE_DEFS) as WhatsAppConfig['aiMode'][]).map(mode => ({
    mode,
    icon: AI_MODE_DEFS[mode].icon,
    label: labelAiMode(locale, mode),
    description: labelAiModeDescription(locale, mode),
  }));
}

const NAV_TAB_KEYS: Record<WhatsAppTab, { labelKey: TranslationKey; descKey: TranslationKey }> = {
  overview: { labelKey: 'whatsapp.nav.overview', descKey: 'whatsapp.nav.overviewDesc' },
  inbox: { labelKey: 'whatsapp.nav.inbox', descKey: 'whatsapp.nav.inboxDesc' },
  templates: { labelKey: 'whatsapp.nav.templates', descKey: 'whatsapp.nav.templatesDesc' },
  settings: { labelKey: 'whatsapp.nav.settings', descKey: 'whatsapp.nav.settingsDesc' },
};

export function localizedNavItems(locale: string) {
  return NAV_ITEM_DEFS.map(item => ({
    key: item.key,
    icon: item.icon,
    label: wa(locale, NAV_TAB_KEYS[item.key].labelKey),
    desc: wa(locale, NAV_TAB_KEYS[item.key].descKey),
  }));
}

const INBOX_FILTER_LABEL_KEYS: Record<InboxFilter, TranslationKey> = {
  all: 'whatsapp.inbox.filter.all',
  unread: 'whatsapp.inbox.filter.unread',
  needs_reply: 'whatsapp.inbox.filter.needs_reply',
  ai_suggested: 'whatsapp.inbox.filter.ai_suggested',
  human_handover: 'whatsapp.inbox.filter.human_handover',
  booking: 'whatsapp.inbox.filter.booking',
  documents: 'whatsapp.inbox.filter.documents',
  payment: 'whatsapp.inbox.filter.payment',
  damage: 'whatsapp.inbox.filter.damage',
  unknown_customer: 'whatsapp.inbox.filter.unknown_customer',
};

export function localizedInboxFilters(locale: string) {
  return INBOX_FILTER_DEFS.map(filter => ({
    key: filter.key,
    needsIntent: filter.needsIntent,
    label: wa(locale, INBOX_FILTER_LABEL_KEYS[filter.key]),
  }));
}

export function labelTemplateCategory(locale: string, category: string): string {
  const key = TEMPLATE_CATEGORY_KEYS[category];
  return key ? wa(locale, key) : category;
}

export function localizedTemplateCategories(locale: string) {
  return Object.entries(TEMPLATE_CATEGORY_KEYS).map(([category, key]) => ({
    category,
    label: wa(locale, key),
  }));
}

export function formatRelativeTime(locale: string, iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return wa(locale, 'whatsapp.time.justNow');
  if (diffMin < 60) return wa(locale, 'whatsapp.time.minutesAgo', { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return wa(locale, 'whatsapp.time.hoursAgo', { count: diffHr });
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return wa(locale, 'whatsapp.time.yesterday');
  if (diffDays < 7) return wa(locale, 'whatsapp.time.daysAgo', { count: diffDays });
  return d.toLocaleDateString();
}

export interface LocalizedReadinessCheck {
  id: string;
  label: string;
  status: ReadinessCheckDef['status'];
  detail: string;
  action?: string;
  tab?: WhatsAppTab;
}

function localizeReadinessCheck(locale: string, def: ReadinessCheckDef): LocalizedReadinessCheck {
  const label = wa(locale, def.labelKey);
  let detail: string;
  if (def.detailPhone) {
    detail = def.detailPhone;
  } else if (def.detailKey === 'whatsapp.readiness.webhook.detailRecent' && def.detailIso) {
    detail = wa(locale, def.detailKey, { time: formatRelativeTime(locale, def.detailIso) });
  } else if (def.detailKey) {
    detail = wa(locale, def.detailKey, def.detailVars);
  } else {
    detail = '';
  }
  const action = def.actionKey ? wa(locale, def.actionKey) : undefined;
  return {
    id: def.id,
    label,
    status: def.status,
    detail,
    action,
    tab: def.tab,
  };
}

export function localizedReadinessChecks(
  locale: string,
  config: WhatsAppConfig | null,
  stats: WhatsAppStats | null,
  templates: WhatsAppTemplate[],
): LocalizedReadinessCheck[] {
  return buildReadinessCheckDefs(config, stats, templates).map(def =>
    localizeReadinessCheck(locale, def),
  );
}

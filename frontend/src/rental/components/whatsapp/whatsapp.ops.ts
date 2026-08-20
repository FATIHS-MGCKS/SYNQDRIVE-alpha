import type {
  WhatsAppConfig,
  WhatsAppConversation,
  WhatsAppMsg,
  WhatsAppStats,
  WhatsAppTemplate,
} from '../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';

export type WhatsAppTab = 'overview' | 'inbox' | 'templates' | 'settings';

export type WhatsAppConnectionStatus =
  | 'connected'
  | 'setup_required'
  | 'error'
  | 'disconnected';

export type InboxFilter =
  | 'all'
  | 'unread'
  | 'needs_reply'
  | 'ai_suggested'
  | 'human_handover'
  | 'booking'
  | 'documents'
  | 'payment'
  | 'damage'
  | 'unknown_customer';

export type MobilePane = 'inbox' | 'chat' | 'context';

export const AI_MODE_DEFS: Record<WhatsAppConfig['aiMode'], { icon: string }> = {
  OFF: { icon: 'eye-off' },
  SUGGEST_ONLY: { icon: 'sparkles' },
  AUTO_SIMPLE: { icon: 'bot' },
  FULL: { icon: 'shield' },
};

export const TEMPLATE_CATEGORY_KEYS: Record<string, TranslationKey> = {
  BOOKING_CONFIRMATION: 'whatsapp.template.category.BOOKING_CONFIRMATION',
  PICKUP_REMINDER: 'whatsapp.template.category.PICKUP_REMINDER',
  RETURN_REMINDER: 'whatsapp.template.category.RETURN_REMINDER',
  MISSING_DOCUMENTS: 'whatsapp.template.category.MISSING_DOCUMENTS',
  PAYMENT_REMINDER: 'whatsapp.template.category.PAYMENT_REMINDER',
  DEPOSIT_REMINDER: 'whatsapp.template.category.DEPOSIT_REMINDER',
  DAMAGE_FOLLOWUP: 'whatsapp.template.category.DAMAGE_FOLLOWUP',
  HANDOVER_LINK: 'whatsapp.template.category.HANDOVER_LINK',
  RETURN_LINK: 'whatsapp.template.category.RETURN_LINK',
  SUPPORT_UPDATE: 'whatsapp.template.category.SUPPORT_UPDATE',
  VEHICLE_READY: 'whatsapp.template.category.VEHICLE_READY',
};

export const NAV_ITEM_DEFS: { key: WhatsAppTab; icon: string }[] = [
  { key: 'overview', icon: 'layout-dashboard' },
  { key: 'inbox', icon: 'message-circle' },
  { key: 'templates', icon: 'file-text' },
  { key: 'settings', icon: 'settings' },
];

export const INBOX_FILTER_DEFS: { key: InboxFilter; needsIntent?: boolean }[] = [
  { key: 'all' },
  { key: 'unread' },
  { key: 'needs_reply' },
  { key: 'ai_suggested', needsIntent: true },
  { key: 'human_handover' },
  { key: 'booking' },
  { key: 'documents', needsIntent: true },
  { key: 'payment', needsIntent: true },
  { key: 'damage', needsIntent: true },
  { key: 'unknown_customer' },
];

export function resolveConnectionStatus(config: WhatsAppConfig | null): WhatsAppConnectionStatus {
  if (!config?.isConnected) return 'disconnected';
  if (config.providerStatus === 'ERROR') return 'error';
  if (!config.providerConfigured && !config.phoneNumberId) return 'setup_required';
  if (!config.isActive) return 'setup_required';
  return 'connected';
}

export function connectionStatusTone(
  status: WhatsAppConnectionStatus,
): 'success' | 'watch' | 'critical' | 'neutral' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'setup_required':
      return 'watch';
    case 'error':
      return 'critical';
    default:
      return 'neutral';
  }
}

export interface ReadinessCheckDef {
  id: string;
  labelKey: TranslationKey;
  status: 'ok' | 'warn' | 'error' | 'pending';
  detailKey?: TranslationKey;
  detailVars?: Record<string, string | number>;
  detailIso?: string;
  detailPhone?: string;
  actionKey?: TranslationKey;
  tab?: WhatsAppTab;
}

export function buildReadinessCheckDefs(
  config: WhatsAppConfig | null,
  stats: WhatsAppStats | null,
  templates: WhatsAppTemplate[],
): ReadinessCheckDef[] {
  const webhookRecent =
    config?.lastWebhookAt &&
    Date.now() - new Date(config.lastWebhookAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const approvedTemplates = templates.filter(t => t.providerStatus === 'APPROVED').length;
  const aiMode = config?.aiMode ?? 'OFF';
  const aiModeLabelKey: TranslationKey =
    aiMode === 'OFF'
      ? 'whatsapp.aiMode.off.label'
      : aiMode === 'SUGGEST_ONLY'
        ? 'whatsapp.aiMode.suggest_only.label'
        : aiMode === 'AUTO_SIMPLE'
          ? 'whatsapp.aiMode.auto_simple.label'
          : 'whatsapp.aiMode.full.label';

  return [
    {
      id: 'connection',
      labelKey: 'whatsapp.readiness.connection.label',
      status: config?.isConnected && config.isActive ? 'ok' : config?.isConnected ? 'warn' : 'error',
      detailKey: config?.isConnected
        ? config.phoneNumber
          ? undefined
          : 'whatsapp.connection.connectedNumberOnFile'
        : 'whatsapp.readiness.connection.detailDisconnected',
      detailPhone: config?.isConnected && config.phoneNumber ? config.phoneNumber : undefined,
      actionKey: config?.isConnected ? undefined : 'whatsapp.readiness.connection.action',
      tab: 'settings',
    },
    {
      id: 'webhook',
      labelKey: 'whatsapp.readiness.webhook.label',
      status: webhookRecent ? 'ok' : config?.lastWebhookAt ? 'warn' : 'pending',
      detailKey: config?.lastWebhookAt
        ? 'whatsapp.readiness.webhook.detailRecent'
        : 'whatsapp.readiness.webhook.detailNone',
      detailIso: config?.lastWebhookAt ?? undefined,
      actionKey: !webhookRecent ? 'whatsapp.readiness.webhook.action' : undefined,
      tab: 'settings',
    },
    {
      id: 'templates',
      labelKey: 'whatsapp.readiness.templates.label',
      status: approvedTemplates > 0 ? 'ok' : templates.length > 0 ? 'warn' : 'pending',
      detailKey:
        approvedTemplates > 0
          ? 'whatsapp.readiness.templates.detailApproved'
          : 'whatsapp.readiness.templates.detailNone',
      detailVars: approvedTemplates > 0 ? { count: approvedTemplates } : undefined,
      actionKey: 'whatsapp.readiness.templates.action',
      tab: 'templates',
    },
    {
      id: 'ai',
      labelKey: 'whatsapp.readiness.ai.label',
      status: config?.aiMode && config.aiMode !== 'OFF' ? 'ok' : 'warn',
      detailKey: aiModeLabelKey,
      tab: 'settings',
    },
    {
      id: 'handover',
      labelKey: 'whatsapp.readiness.handover.label',
      status: config?.aiEscalationEnabled ? 'ok' : 'warn',
      detailKey: config?.aiEscalationEnabled
        ? 'whatsapp.readiness.handover.detailEnabled'
        : 'whatsapp.readiness.handover.detailDisabled',
      tab: 'settings',
    },
    {
      id: 'consent',
      labelKey: 'whatsapp.readiness.consent.label',
      status: 'ok',
      detailKey: 'whatsapp.readiness.consent.detail',
    },
    {
      id: 'last_webhook',
      labelKey: 'whatsapp.readiness.lastWebhook.label',
      status: config?.lastWebhookAt ? 'ok' : 'pending',
      detailKey: stats?.lastWebhookAt || config?.lastWebhookAt
        ? 'whatsapp.readiness.webhook.detailRecent'
        : 'whatsapp.readiness.lastWebhook.detailAwaiting',
      detailIso: (stats?.lastWebhookAt ?? config?.lastWebhookAt) || undefined,
    },
  ];
}

export function filterConversations(
  conversations: WhatsAppConversation[],
  filter: InboxFilter,
  search: string,
): WhatsAppConversation[] {
  const q = search.trim().toLowerCase();
  return conversations.filter(c => {
    if (q) {
      const hay = `${c.contactName ?? ''} ${c.contactPhone} ${c.lastMessagePreview ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    switch (filter) {
      case 'unread':
        return c.unreadCount > 0;
      case 'needs_reply':
        return c.unreadCount > 0 || c.status === 'PENDING_HUMAN';
      case 'human_handover':
        return c.status === 'PENDING_HUMAN';
      case 'booking':
        return Boolean(c.bookingId);
      case 'unknown_customer':
        return !c.customerId;
      case 'ai_suggested':
        return (
          c.unreadCount > 0 &&
          Boolean(c.intent) &&
          c.intent !== 'UNKNOWN' &&
          c.intent !== 'OPT_OUT'
        );
      case 'documents':
        return c.intent === 'DOCUMENTS';
      case 'payment':
        return c.intent === 'PAYMENT' || c.intent === 'DEPOSIT';
      case 'damage':
        return c.intent === 'DAMAGE' || c.intent === 'ACCIDENT';
      default:
        return true;
    }
  });
}

export function countHumanReview(conversations: WhatsAppConversation[]): number {
  return conversations.filter(c => c.status === 'PENDING_HUMAN').length;
}

export function countFailedInThread(messages: WhatsAppMsg[]): number {
  return messages.filter(m => m.status === 'FAILED').length;
}

export function conversationDisplayName(c: WhatsAppConversation): string {
  return c.contactName?.trim() || c.contactPhone;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function isSandboxEnvironment(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'test';
}

export function canUseAiReply(config: WhatsAppConfig | null): boolean {
  if (!config) return false;
  return config.aiMode === 'AUTO_SIMPLE' || config.aiMode === 'FULL';
}

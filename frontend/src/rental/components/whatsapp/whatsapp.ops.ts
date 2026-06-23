import type {
  WhatsAppConfig,
  WhatsAppConversation,
  WhatsAppMsg,
  WhatsAppStats,
  WhatsAppTemplate,
} from '../../../lib/api';

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

export const AI_MODE_META: Record<
  WhatsAppConfig['aiMode'],
  { label: string; description: string; icon: string }
> = {
  OFF: { label: 'Off', description: 'No AI suggestions or auto-replies', icon: 'eye-off' },
  SUGGEST_ONLY: { label: 'Suggest only', description: 'SynqDrive AI drafts replies — humans send', icon: 'sparkles' },
  AUTO_SIMPLE: { label: 'Auto simple', description: 'Low-risk replies sent automatically', icon: 'bot' },
  FULL: { label: 'Full guardrails', description: 'Broader automation with human handover on sensitive cases', icon: 'shield' },
};

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: 'Booking confirmation',
  PICKUP_REMINDER: 'Pickup reminder',
  RETURN_REMINDER: 'Return reminder',
  MISSING_DOCUMENTS: 'Missing documents',
  PAYMENT_REMINDER: 'Payment reminder',
  DEPOSIT_REMINDER: 'Deposit reminder',
  DAMAGE_FOLLOWUP: 'Damage follow-up',
  HANDOVER_LINK: 'Handover link',
  RETURN_LINK: 'Return link',
  SUPPORT_UPDATE: 'Support update',
  VEHICLE_READY: 'Vehicle ready',
};

export const NAV_ITEMS: { key: WhatsAppTab; label: string; icon: string; desc: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', desc: 'Readiness, KPIs and setup checklist' },
  { key: 'inbox', label: 'Inbox', icon: 'message-circle', desc: 'Operations inbox with linked SynqDrive context' },
  { key: 'templates', label: 'Templates', icon: 'file-text', desc: 'Approved and draft WhatsApp templates' },
  { key: 'settings', label: 'Settings', icon: 'settings', desc: 'Connection, AI, compliance and sandbox' },
];

export const INBOX_FILTERS: { key: InboxFilter; label: string; needsIntent?: boolean }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'needs_reply', label: 'Needs reply' },
  { key: 'ai_suggested', label: 'AI suggested', needsIntent: true },
  { key: 'human_handover', label: 'Human handover' },
  { key: 'booking', label: 'Booking' },
  { key: 'documents', label: 'Documents', needsIntent: true },
  { key: 'payment', label: 'Payment', needsIntent: true },
  { key: 'damage', label: 'Damage', needsIntent: true },
  { key: 'unknown_customer', label: 'Unknown customer' },
];

export function resolveConnectionStatus(config: WhatsAppConfig | null): WhatsAppConnectionStatus {
  if (!config?.isConnected) return 'disconnected';
  if (config.providerStatus === 'ERROR') return 'error';
  if (!config.providerConfigured && !config.phoneNumberId) return 'setup_required';
  if (!config.isActive) return 'setup_required';
  return 'connected';
}

export function connectionStatusLabel(status: WhatsAppConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'setup_required':
      return 'Setup required';
    case 'error':
      return 'Error';
    default:
      return 'Disconnected';
  }
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

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error' | 'pending';
  detail: string;
  action?: string;
  tab?: WhatsAppTab;
}

export function buildReadinessChecks(
  config: WhatsAppConfig | null,
  stats: WhatsAppStats | null,
  templates: WhatsAppTemplate[],
): ReadinessCheck[] {
  const providerOk = Boolean(config?.providerConfigured || config?.phoneNumberId);
  const webhookRecent =
    config?.lastWebhookAt &&
    Date.now() - new Date(config.lastWebhookAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const approvedTemplates = templates.filter(t => t.providerStatus === 'APPROVED').length;

  return [
    {
      id: 'connection',
      label: 'WhatsApp connection',
      status: config?.isConnected && config.isActive ? 'ok' : config?.isConnected ? 'warn' : 'error',
      detail: config?.isConnected
        ? config.phoneNumber ?? 'Connected — number on file'
        : 'Connect your business line to receive messages',
      action: config?.isConnected ? undefined : 'Connect',
      tab: 'settings',
    },
    {
      id: 'webhook',
      label: 'Webhook health',
      status: webhookRecent ? 'ok' : config?.lastWebhookAt ? 'warn' : 'pending',
      detail: config?.lastWebhookAt
        ? `Last event ${formatRelativeTime(config.lastWebhookAt)}`
        : 'No webhook events recorded yet',
      action: !webhookRecent ? 'Verify webhook' : undefined,
      tab: 'settings',
    },
    {
      id: 'templates',
      label: 'Templates',
      status: approvedTemplates > 0 ? 'ok' : templates.length > 0 ? 'warn' : 'pending',
      detail:
        approvedTemplates > 0
          ? `${approvedTemplates} approved template(s)`
          : 'Create templates for out-of-window messaging',
      action: 'Manage templates',
      tab: 'templates',
    },
    {
      id: 'ai',
      label: 'AI mode',
      status: config?.aiMode && config.aiMode !== 'OFF' ? 'ok' : 'warn',
      detail: AI_MODE_META[config?.aiMode ?? 'OFF'].label,
      tab: 'settings',
    },
    {
      id: 'handover',
      label: 'Human handover',
      status: config?.aiEscalationEnabled ? 'ok' : 'warn',
      detail: config?.aiEscalationEnabled
        ? 'Escalation enabled for sensitive cases'
        : 'Enable escalation for payment, damage and legal topics',
      tab: 'settings',
    },
    {
      id: 'consent',
      label: 'Consent / opt-out',
      status: 'ok',
      detail: 'STOP keywords processed server-side; outbound respects opt-out',
    },
    {
      id: 'last_webhook',
      label: 'Last webhook',
      status: config?.lastWebhookAt ? 'ok' : 'pending',
      detail: stats?.lastWebhookAt
        ? formatRelativeTime(stats.lastWebhookAt)
        : config?.lastWebhookAt
          ? formatRelativeTime(config.lastWebhookAt)
          : 'Awaiting first Meta webhook',
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

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
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

export function deliveryStatusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return 'Queued';
    case 'SENT':
      return 'Sent';
    case 'DELIVERED':
      return 'Delivered';
    case 'READ':
      return 'Read';
    case 'FAILED':
      return 'Failed';
    default:
      return status;
  }
}

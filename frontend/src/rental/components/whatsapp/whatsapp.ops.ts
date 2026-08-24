import type {
  WhatsAppConfig,
  WhatsAppStats,
  WhatsAppTemplate,
} from '../../../lib/api';

export type WhatsAppTab = 'overview' | 'inbox' | 'templates' | 'settings';

export type WhatsAppConnectionStatus =
  | 'connected'
  | 'setup_required'
  | 'error'
  | 'disconnected';

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

export function isSandboxEnvironment(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'test';
}

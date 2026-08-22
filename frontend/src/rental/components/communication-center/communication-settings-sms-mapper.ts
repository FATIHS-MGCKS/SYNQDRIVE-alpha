import type { SmsConfig } from '../../../lib/api';

/**
 * Allowlisted mapper — ignores any unexpected secret-shaped fields from backend responses.
 */
export function mapSmsConfigPublic(raw: unknown): SmsConfig {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    organizationId: typeof value.organizationId === 'string' ? value.organizationId : '',
    hasConfigRow: Boolean(value.hasConfigRow),
    isConnected: Boolean(value.isConnected),
    isActive: Boolean(value.isActive),
    credentialsConfigured: Boolean(value.credentialsConfigured),
    webhookSigningConfigured: Boolean(value.webhookSigningConfigured),
    senderProfileConfigured: Boolean(value.senderProfileConfigured),
    webhookEndpointConfigured: Boolean(value.webhookEndpointConfigured),
    lastWebhookAt: value.lastWebhookAt == null ? null : String(value.lastWebhookAt),
    updatedAt: value.updatedAt == null ? null : String(value.updatedAt),
  };
}

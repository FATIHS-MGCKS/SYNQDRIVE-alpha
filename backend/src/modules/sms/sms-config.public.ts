import type { OrgSmsConfig } from '@prisma/client';

export type SmsConfigPublicDto = {
  organizationId: string;
  hasConfigRow: boolean;
  isConnected: boolean;
  isActive: boolean;
  credentialsConfigured: boolean;
  webhookSigningConfigured: boolean;
  senderProfileConfigured: boolean;
  webhookEndpointConfigured: boolean;
  lastWebhookAt: string | null;
  updatedAt: string | null;
};

export function buildSyntheticSmsConfigPublicDto(orgId: string): SmsConfigPublicDto {
  return {
    organizationId: orgId,
    hasConfigRow: false,
    isConnected: false,
    isActive: false,
    credentialsConfigured: false,
    webhookSigningConfigured: false,
    senderProfileConfigured: false,
    webhookEndpointConfigured: false,
    lastWebhookAt: null,
    updatedAt: null,
  };
}

export function mapOrgSmsConfigToPublicDto(config: OrgSmsConfig): SmsConfigPublicDto {
  return {
    organizationId: config.organizationId,
    hasConfigRow: true,
    isConnected: config.isConnected,
    isActive: config.isActive,
    credentialsConfigured: config.apiKeyConfigured,
    webhookSigningConfigured: config.webhookSigningSecretConfigured,
    senderProfileConfigured: Boolean(config.senderProfileId),
    webhookEndpointConfigured: Boolean(config.webhookEndpointId),
    lastWebhookAt: config.lastWebhookAt?.toISOString() ?? null,
    updatedAt: config.updatedAt.toISOString(),
  };
}

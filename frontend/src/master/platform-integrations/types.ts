export type IntegrationConfigurationState = 'complete' | 'incomplete';
export type IntegrationAuthenticationState = 'valid' | 'failed' | 'unknown';
export type IntegrationRuntimeHealth = 'healthy' | 'degraded' | 'error' | 'unknown';
export type IntegrationEnvironment = 'test' | 'live' | 'simulate' | 'not_applicable';
export type IntegrationScope = 'platform' | 'platform_tenant' | 'tenant';

export type IntegrationAttentionCode =
  | 'CONFIG_INCOMPLETE'
  | 'AUTH_FAILED'
  | 'WEBHOOK_FAILURES'
  | 'RECONCILIATION_DRIFT'
  | 'DELIVERY_FAILURES'
  | 'SIMULATE_MODE_ACTIVE'
  | 'STALE_DATA'
  | 'PROVIDER_DEGRADED';

export type PlatformIntegrationsSection =
  | 'overview'
  | 'integrations'
  | 'webhooks'
  | 'settings'
  | 'changelog';

export type SettingsCategory = 'communication' | 'billing' | 'vehicles' | 'flags' | 'operations';

export interface PlatformIntegrationDirectoryEntryDto {
  id: string;
  name: string;
  purpose: string;
  scope: IntegrationScope;
  environment: IntegrationEnvironment;
  configuration: IntegrationConfigurationState;
  authentication: IntegrationAuthenticationState;
  runtimeHealth: IntegrationRuntimeHealth;
  attentionCodes: IntegrationAttentionCode[];
  lastActivityAt: string | null;
  lastHealthCheckAt: string;
  moduleError?: string;
  drilldownView: string;
  drilldownParams?: Record<string, string>;
}

export interface PlatformIntegrationsDirectoryDto {
  generatedAt: string;
  attentionCount: number;
  environmentSummary: {
    stripeMode: 'TEST' | 'LIVE' | null;
    whatsappSimulate: boolean;
  };
  entries: PlatformIntegrationDirectoryEntryDto[];
  moduleErrors: Partial<Record<string, string>>;
}

export interface PlatformIntegrationsAttentionSummaryDto {
  generatedAt: string;
  total: number;
  byCode: Partial<Record<IntegrationAttentionCode, number>>;
  topItems: Array<{
    integrationId: string;
    integrationName: string;
    codes: IntegrationAttentionCode[];
    summary: string;
  }>;
}

export interface PlatformIntegrationWebhookRowDto {
  id: string;
  provider: string;
  endpoint: string;
  environment: IntegrationEnvironment;
  signatureState: 'configured' | 'missing' | 'unknown';
  lastEventAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  deliveryHealth: IntegrationRuntimeHealth;
  failedCount24h?: number;
}

export interface PlatformIntegrationWebhooksDto {
  generatedAt: string;
  entries: PlatformIntegrationWebhookRowDto[];
  moduleErrors: Partial<Record<string, string>>;
}

export interface PlatformIntegrationDetailDto {
  id: string;
  name: string;
  purpose: string;
  scope: IntegrationScope;
  environment: IntegrationEnvironment;
  configuration: IntegrationConfigurationState;
  authentication: IntegrationAuthenticationState;
  runtimeHealth: IntegrationRuntimeHealth;
  attentionCodes: IntegrationAttentionCode[];
  lastActivityAt: string | null;
  lastHealthCheckAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorSummary: string | null;
  configurationFields: Array<{
    key: string;
    label: string;
    value: string;
    scope: IntegrationScope;
    secret?: boolean;
  }>;
  issues: Array<{ code: IntegrationAttentionCode; message: string; severity: 'warning' | 'critical' }>;
  tenantImpact?: { label: string; count: number };
  drilldownView: string;
  drilldownParams?: Record<string, string>;
  moduleError?: string;
}

export interface PlatformFlagDto {
  key: string;
  label: string;
  description: string;
  value: string;
  scope: 'platform';
  editable: false;
}

export interface PlatformIntegrationsFlagsDto {
  generatedAt: string;
  flags: PlatformFlagDto[];
}

export interface PlatformIntegrationsLocation {
  section: PlatformIntegrationsSection;
  integrationId: string | null;
  settingsCategory: SettingsCategory;
  attentionOnly: boolean;
}

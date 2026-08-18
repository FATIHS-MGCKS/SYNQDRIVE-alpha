import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAdminService } from '@modules/billing/billing-admin.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformEmailSettingsService } from '@modules/outbound-email/platform-email-settings.service';
import { PlatformConnectivitySummaryService } from './platform-dashboard.service';
import { HighMobilityAppConfigService } from '@modules/high-mobility/high-mobility-app-config.service';
import { VoiceControlPlaneAdminService } from '@modules/voice-assistant/admin/voice-control-plane-admin.service';
import {
  IntegrationAttentionCode,
  IntegrationAuthenticationState,
  IntegrationConfigurationState,
  IntegrationEnvironment,
  IntegrationRuntimeHealth,
  IntegrationScope,
  PlatformIntegrationDetailDto,
  PlatformIntegrationDirectoryEntryDto,
  PlatformIntegrationsAttentionSummaryDto,
  PlatformIntegrationsDirectoryDto,
  PlatformIntegrationsFlagsDto,
  PlatformIntegrationWebhookRowDto,
  PlatformIntegrationWebhooksDto,
} from './platform-integrations.types';

const INTEGRATION_META: Record<
  string,
  { name: string; purpose: string; scope: IntegrationScope; drilldownView: string; drilldownParams?: Record<string, string> }
> = {
  dimo: {
    name: 'DIMO',
    purpose: 'Telematik-Plattform, Segments und Fahrzeug-Sync',
    scope: 'platform',
    drilldownView: 'vehicles',
    drilldownParams: { cvSection: 'overview' },
  },
  stripe: {
    name: 'Stripe',
    purpose: 'SaaS-Abrechnung und Connect-Zahlungen',
    scope: 'platform',
    drilldownView: 'billing',
    drilldownParams: { masterBilling: 'reconciliation' },
  },
  email: {
    name: 'E-Mail (Resend)',
    purpose: 'Transaktions-E-Mail und Plattform-Absender',
    scope: 'platform_tenant',
    drilldownView: 'platform-integrations',
    drilldownParams: { platformIntegrations: 'settings', settingsCategory: 'communication' },
  },
  voice: {
    name: 'Sprachassistent',
    purpose: 'Voice AI, Twilio PSTN und ElevenLabs',
    scope: 'platform_tenant',
    drilldownView: 'voice-assistant',
    drilldownParams: { voiceSection: 'platform' },
  },
  whatsapp: {
    name: 'WhatsApp',
    purpose: 'Rental-Messaging und Kundenkommunikation',
    scope: 'platform_tenant',
    drilldownView: 'platform-integrations',
    drilldownParams: { platformIntegrations: 'integrations', integrationId: 'whatsapp' },
  },
  'high-mobility': {
    name: 'High Mobility',
    purpose: 'OEM-Telematik und Streaming',
    scope: 'tenant',
    drilldownView: 'high-mobility',
  },
  notifications: {
    name: 'Benachrichtigungen',
    purpose: 'Notification Engine und Kanäle',
    scope: 'platform_tenant',
    drilldownView: 'platform-integrations',
    drilldownParams: { platformIntegrations: 'settings', settingsCategory: 'flags' },
  },
};

@Injectable()
export class PlatformIntegrationsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly billingAdmin: BillingAdminService,
    private readonly platformEmail: PlatformEmailSettingsService,
    private readonly connectivity: PlatformConnectivitySummaryService,
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly voiceControlPlane: VoiceControlPlaneAdminService,
  ) {}

  async getDirectory(): Promise<PlatformIntegrationsDirectoryDto> {
    const generatedAt = new Date().toISOString();
    const moduleErrors: Partial<Record<string, string>> = {};
    const builders = await Promise.allSettled([
      this.buildDimoEntry(),
      this.buildStripeEntry(),
      this.buildEmailEntry(),
      this.buildVoiceEntry(),
      this.buildWhatsAppEntry(),
      this.buildHighMobilityEntry(),
      this.buildNotificationsEntry(),
    ]);

    const entries: PlatformIntegrationDirectoryEntryDto[] = [];
    const ids = ['dimo', 'stripe', 'email', 'voice', 'whatsapp', 'high-mobility', 'notifications'];
    builders.forEach((result, index) => {
      const id = ids[index];
      if (result.status === 'fulfilled') {
        entries.push(result.value);
      } else {
        moduleErrors[id] = String(result.reason?.message ?? result.reason);
        entries.push(this.fallbackEntry(id));
      }
    });

    const attentionCount = entries.reduce((sum, e) => sum + e.attentionCodes.length, 0);
    const stripeEntry = entries.find((e) => e.id === 'stripe');

    return {
      generatedAt,
      attentionCount,
      environmentSummary: {
        stripeMode:
          stripeEntry?.environment === 'test'
            ? 'TEST'
            : stripeEntry?.environment === 'live'
              ? 'LIVE'
              : null,
        whatsappSimulate: this.isWhatsAppSimulate(),
      },
      entries: this.sortEntries(entries),
      moduleErrors,
    };
  }

  async getAttentionSummary(): Promise<PlatformIntegrationsAttentionSummaryDto> {
    const directory = await this.getDirectory();
    const byCode: Partial<Record<IntegrationAttentionCode, number>> = {};
    const topItems: PlatformIntegrationsAttentionSummaryDto['topItems'] = [];

    for (const entry of directory.entries) {
      if (entry.attentionCodes.length === 0) continue;
      for (const code of entry.attentionCodes) {
        byCode[code] = (byCode[code] ?? 0) + 1;
      }
      topItems.push({
        integrationId: entry.id,
        integrationName: entry.name,
        codes: entry.attentionCodes,
        summary: entry.attentionCodes.join(', '),
      });
    }

    return {
      generatedAt: directory.generatedAt,
      total: topItems.length,
      byCode,
      topItems: topItems.slice(0, 12),
    };
  }

  async getDetail(integrationId: string): Promise<PlatformIntegrationDetailDto> {
    const directory = await this.getDirectory();
    const base = directory.entries.find((e) => e.id === integrationId);
    if (!base) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }

    switch (integrationId) {
      case 'dimo':
        return this.buildDimoDetail(base);
      case 'stripe':
        return this.buildStripeDetail(base);
      case 'email':
        return this.buildEmailDetail(base);
      case 'voice':
        return this.buildVoiceDetail(base);
      case 'whatsapp':
        return this.buildWhatsAppDetail(base);
      case 'high-mobility':
        return this.buildHighMobilityDetail(base);
      case 'notifications':
        return this.buildNotificationsDetail(base);
      default:
        return this.toDetailFromEntry(base);
    }
  }

  async getWebhooks(): Promise<PlatformIntegrationWebhooksDto> {
    const generatedAt = new Date().toISOString();
    const moduleErrors: Partial<Record<string, string>> = {};
    const entries: PlatformIntegrationWebhookRowDto[] = [];

    const [stripeResult, voiceResult] = await Promise.allSettled([
      this.billingAdmin.getStripeStatus(),
      this.voiceControlPlane.getPlatformStatus(),
    ]);

    if (stripeResult.status === 'fulfilled') {
      const stripe = stripeResult.value;
      const failedRecent = stripe.failedWebhookCount ?? 0;
      entries.push({
        id: 'stripe-billing',
        provider: 'Stripe (Abrechnung)',
        endpoint: '/webhooks/stripe',
        environment: stripe.runtimeStripeMode === 'LIVE' ? 'live' : stripe.runtimeStripeMode === 'TEST' ? 'test' : 'not_applicable',
        signatureState: stripe.stripeWebhookConfigured ? 'configured' : 'missing',
        lastEventAt: stripe.lastWebhookAt,
        lastSuccessAt: stripe.lastSuccessfulWebhookAt,
        lastFailureAt: failedRecent > 0 ? stripe.lastWebhookAt : null,
        deliveryHealth:
          failedRecent > 0 ? 'degraded' : stripe.lastWebhookAt ? 'healthy' : stripe.stripeWebhookConfigured ? 'unknown' : 'error',
        failedCount24h: failedRecent,
      });
      entries.push({
        id: 'stripe-connect',
        provider: 'Stripe Connect',
        endpoint: '/webhooks/stripe-connect',
        environment: stripe.runtimeStripeMode === 'LIVE' ? 'live' : stripe.runtimeStripeMode === 'TEST' ? 'test' : 'not_applicable',
        signatureState: Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()) ? 'configured' : 'missing',
        lastEventAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        deliveryHealth: 'unknown',
      });
    } else {
      moduleErrors.stripe = String(stripeResult.reason?.message ?? stripeResult.reason);
    }

    if (voiceResult.status === 'fulfilled') {
      const voice = voiceResult.value;
      const failed = voice.webhooks.dlqCount24h ?? 0;
      entries.push({
        id: 'voice-webhooks',
        provider: 'Voice (Twilio/ElevenLabs)',
        endpoint: '/webhooks/voice/*',
        environment: 'live',
        signatureState: 'configured',
        lastEventAt: voice.checkedAt,
        lastSuccessAt: voice.checkedAt,
        lastFailureAt: failed > 0 ? voice.checkedAt : null,
        deliveryHealth: failed > 0 ? 'degraded' : voice.providers.webhookIngestion.ok ? 'healthy' : 'unknown',
        failedCount24h: failed,
      });
    } else {
      moduleErrors.voice = String(voiceResult.reason?.message ?? voiceResult.reason);
    }

    entries.push({
      id: 'dimo-webhook',
      provider: 'DIMO',
      endpoint: '/webhooks/dimo',
      environment: 'live',
      signatureState: 'unknown',
      lastEventAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      deliveryHealth: 'unknown',
    });

    entries.push({
      id: 'resend-inbound',
      provider: 'Resend (Inbound)',
      endpoint: '/webhooks/resend',
      environment: 'live',
      signatureState: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()) ? 'configured' : 'missing',
      lastEventAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      deliveryHealth: 'unknown',
    });

    return { generatedAt, entries, moduleErrors };
  }

  getPlatformFlags(): PlatformIntegrationsFlagsDto {
    return {
      generatedAt: new Date().toISOString(),
      flags: [
        {
          key: 'NOTIFICATIONS_V2',
          label: 'Notification Engine v2',
          description: 'Aktiviert die neue Benachrichtigungs-Engine plattformweit.',
          value: process.env.NOTIFICATIONS_V2 === 'true' ? 'Aktiv' : 'Inaktiv',
          scope: 'platform',
          editable: false,
        },
        {
          key: 'WHATSAPP_SIMULATE_ENABLED',
          label: 'WhatsApp Simulationsmodus',
          description: 'Blockiert echte WhatsApp-Sends plattformweit.',
          value: this.isWhatsAppSimulate() ? 'Simuliert' : 'Live',
          scope: 'platform',
          editable: false,
        },
        {
          key: 'TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE',
          label: 'Workflow Runtime Modus',
          description: 'Task-Automation: legacy, shadow oder cutover.',
          value: process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE ?? 'legacy',
          scope: 'platform',
          editable: false,
        },
        {
          key: 'STATIONS_V2_ENABLED',
          label: 'Stations v2',
          description: 'Globale Stations-v2-Funktionalität.',
          value: process.env.STATIONS_V2_ENABLED === 'true' ? 'Aktiv' : 'Inaktiv',
          scope: 'platform',
          editable: false,
        },
      ],
    };
  }

  private sortEntries(entries: PlatformIntegrationDirectoryEntryDto[]) {
    const severity = (e: PlatformIntegrationDirectoryEntryDto) => {
      if (e.runtimeHealth === 'error') return 0;
      if (e.attentionCodes.length > 0) return 1;
      if (e.runtimeHealth === 'degraded') return 2;
      if (e.configuration === 'incomplete') return 3;
      return 4;
    };
    return [...entries].sort((a, b) => severity(a) - severity(b) || a.name.localeCompare(b.name, 'de'));
  }

  private fallbackEntry(id: string): PlatformIntegrationDirectoryEntryDto {
    const meta = INTEGRATION_META[id];
    return {
      id,
      name: meta?.name ?? id,
      purpose: meta?.purpose ?? '',
      scope: meta?.scope ?? 'platform',
      environment: 'not_applicable',
      configuration: 'incomplete',
      authentication: 'unknown',
      runtimeHealth: 'unknown',
      attentionCodes: ['CONFIG_INCOMPLETE'],
      lastActivityAt: null,
      lastHealthCheckAt: new Date().toISOString(),
      moduleError: 'Daten konnten nicht geladen werden',
      drilldownView: meta?.drilldownView ?? 'platform-integrations',
      drilldownParams: meta?.drilldownParams,
    };
  }

  private async buildDimoEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.dimo;
    const health = await this.platformAdmin.getPlatformHealth();
    const dimo = health.integrations.dimo;
    const token = dimo.tokenHealth as { status?: string; lastRefreshAt?: string } | undefined;
    const tokenOk = token?.status === 'ok' || token?.status === 'healthy';
    const clientConfigured = Boolean(
      process.env.DIMO_CLIENT_ID?.trim() && process.env.DIMO_PRIVATE_KEY?.trim(),
    );
    const configuration: IntegrationConfigurationState = clientConfigured ? 'complete' : 'incomplete';
    const authentication: IntegrationAuthenticationState = token?.status === 'error' ? 'failed' : tokenOk ? 'valid' : clientConfigured ? 'unknown' : 'unknown';
    const runtimeHealth: IntegrationRuntimeHealth =
      health.overallStatus === 'critical'
        ? 'error'
        : health.overallStatus === 'warning'
          ? 'degraded'
          : tokenOk
            ? 'healthy'
            : 'unknown';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');
    if (authentication === 'failed') attentionCodes.push('AUTH_FAILED');

    return {
      id: 'dimo',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: 'live',
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: token?.lastRefreshAt ?? health.generatedAt,
      lastHealthCheckAt: health.generatedAt,
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildStripeEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.stripe;
    const stripe = await this.billingAdmin.getStripeStatus();
    const configuration: IntegrationConfigurationState =
      stripe.integrationStatus === 'CONNECTED' ? 'complete' : 'incomplete';
    const environment: IntegrationEnvironment =
      stripe.runtimeStripeMode === 'LIVE' ? 'live' : stripe.runtimeStripeMode === 'TEST' ? 'test' : 'not_applicable';
    const authentication: IntegrationAuthenticationState = stripe.stripeSecretConfigured
      ? 'valid'
      : 'failed';
    const runtimeHealth: IntegrationRuntimeHealth =
      (stripe.failedWebhookCount ?? 0) > 5
        ? 'error'
        : (stripe.failedWebhookCount ?? 0) > 0
          ? 'degraded'
          : stripe.lastWebhookAt
            ? 'healthy'
            : configuration === 'complete'
              ? 'unknown'
              : 'error';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');
    if ((stripe.failedWebhookCount ?? 0) > 0) attentionCodes.push('WEBHOOK_FAILURES');

    return {
      id: 'stripe',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment,
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: stripe.lastWebhookAt,
      lastHealthCheckAt: new Date().toISOString(),
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildEmailEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.email;
    const [settings, overview] = await Promise.all([
      this.platformEmail.getAdminSettings(),
      this.billingAdmin.getOverview().catch(() => null),
    ]);
    const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
    const configuration: IntegrationConfigurationState =
      resendConfigured && settings.effectiveFromEmail ? 'complete' : 'incomplete';
    const authentication: IntegrationAuthenticationState = resendConfigured ? 'valid' : 'failed';
    const failedEmails = overview?.failedEmailDeliveries ?? 0;
    const runtimeHealth: IntegrationRuntimeHealth =
      failedEmails > 10 ? 'error' : failedEmails > 0 ? 'degraded' : resendConfigured ? 'healthy' : 'error';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');
    if (failedEmails > 0) attentionCodes.push('DELIVERY_FAILURES');

    return {
      id: 'email',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: 'live',
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: settings.updatedAt,
      lastHealthCheckAt: new Date().toISOString(),
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildVoiceEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.voice;
    const voice = await this.voiceControlPlane.getPlatformStatus();
    const elevenOk = voice.providers.elevenLabs.ok;
    const twilioOk = voice.providers.twilioIe1.ok;
    const configuration: IntegrationConfigurationState = elevenOk && twilioOk ? 'complete' : 'incomplete';
    const authentication: IntegrationAuthenticationState =
      elevenOk || twilioOk ? 'valid' : 'failed';
    const failed = voice.webhooks.dlqCount24h ?? 0;
    const backlog = voice.queues.webhookBacklog ?? 0;
    const runtimeHealth: IntegrationRuntimeHealth =
      voice.activeIncidents.some((i) => i.severity === 'critical')
        ? 'error'
        : failed > 0 || backlog > 50
          ? 'degraded'
          : configuration === 'complete'
            ? 'healthy'
            : 'unknown';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');
    if (failed > 0) attentionCodes.push('WEBHOOK_FAILURES');

    return {
      id: 'voice',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: 'live',
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: voice.checkedAt,
      lastHealthCheckAt: voice.checkedAt,
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildWhatsAppEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.whatsapp;
    const simulate = this.isWhatsAppSimulate();
    const connectedOrgs = await this.prisma.orgWhatsAppConfig.count({
      where: { providerStatus: 'CONNECTED' },
    });
    const tokenConfigured = Boolean(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim());
    const configuration: IntegrationConfigurationState =
      tokenConfigured || connectedOrgs > 0 ? 'complete' : 'incomplete';
    const authentication: IntegrationAuthenticationState = tokenConfigured ? 'valid' : 'unknown';
    const runtimeHealth: IntegrationRuntimeHealth = simulate
      ? 'degraded'
      : configuration === 'complete'
        ? 'healthy'
        : 'unknown';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (simulate) attentionCodes.push('SIMULATE_MODE_ACTIVE');
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');

    return {
      id: 'whatsapp',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: simulate ? 'simulate' : 'live',
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: null,
      lastHealthCheckAt: new Date().toISOString(),
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildHighMobilityEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META['high-mobility'];
    const oauthReady = this.hmConfig.isHealthAppOAuthReady() || this.hmConfig.isTelemetryAppOAuthReady();
    const configuration: IntegrationConfigurationState = oauthReady ? 'complete' : 'incomplete';
    const authentication: IntegrationAuthenticationState = oauthReady ? 'valid' : 'unknown';
    const runtimeHealth: IntegrationRuntimeHealth = oauthReady ? 'healthy' : 'unknown';
    const attentionCodes: IntegrationAttentionCode[] = [];
    if (configuration === 'incomplete') attentionCodes.push('CONFIG_INCOMPLETE');

    return {
      id: 'high-mobility',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: 'live',
      configuration,
      authentication,
      runtimeHealth,
      attentionCodes,
      lastActivityAt: null,
      lastHealthCheckAt: new Date().toISOString(),
      drilldownView: meta.drilldownView,
    };
  }

  private async buildNotificationsEntry(): Promise<PlatformIntegrationDirectoryEntryDto> {
    const meta = INTEGRATION_META.notifications;
    const enabled = process.env.NOTIFICATIONS_V2 === 'true';
    const configuration: IntegrationConfigurationState = 'complete';
    const runtimeHealth: IntegrationRuntimeHealth = enabled ? 'healthy' : 'degraded';
    const attentionCodes: IntegrationAttentionCode[] = enabled ? [] : ['PROVIDER_DEGRADED'];

    return {
      id: 'notifications',
      name: meta.name,
      purpose: meta.purpose,
      scope: meta.scope,
      environment: 'not_applicable',
      configuration,
      authentication: 'unknown',
      runtimeHealth,
      attentionCodes,
      lastActivityAt: null,
      lastHealthCheckAt: new Date().toISOString(),
      drilldownView: meta.drilldownView,
      drilldownParams: meta.drilldownParams,
    };
  }

  private async buildDimoDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    const health = await this.platformAdmin.getPlatformHealth();
    const connectivity = await this.connectivity.getPlatformSummary().catch(() => null);
    const dimo = health.integrations.dimo;
    const token = dimo.tokenHealth as { status?: string; message?: string } | undefined;

    return {
      ...this.toDetailFromEntry(base),
      lastSuccessAt: health.generatedAt,
      lastErrorAt: token?.status === 'error' ? health.generatedAt : null,
      lastErrorSummary: token?.status === 'error' ? (token.message ?? 'Token-Health fehlgeschlagen') : null,
      configurationFields: [
        { key: 'client', label: 'DIMO Client', value: process.env.DIMO_CLIENT_ID?.trim() ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'privateKey', label: 'Private Key', value: process.env.DIMO_PRIVATE_KEY?.trim() ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'vehicles', label: 'Verbundene Fahrzeuge', value: String(dimo.connected ?? 0), scope: 'tenant' },
      ],
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: code === 'AUTH_FAILED' ? 'critical' as const : 'warning' as const,
      })),
      tenantImpact: connectivity
        ? { label: 'Fahrzeuge mit DIMO-Verbindung', count: connectivity.platform.dimoConnected ?? dimo.connected ?? 0 }
        : { label: 'Fahrzeuge mit DIMO-Verbindung', count: dimo.connected ?? 0 },
    };
  }

  private async buildStripeDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    const stripe = await this.billingAdmin.getStripeStatus();
    const overview = await this.billingAdmin.getOverview().catch(() => null);

    return {
      ...this.toDetailFromEntry(base),
      lastSuccessAt: stripe.lastSuccessfulWebhookAt,
      lastErrorAt: (stripe.failedWebhookCount ?? 0) > 0 ? stripe.lastWebhookAt : null,
      lastErrorSummary:
        (stripe.failedWebhookCount ?? 0) > 0
          ? `${stripe.failedWebhookCount} fehlgeschlagene Webhook-Events`
          : null,
      configurationFields: [
        { key: 'mode', label: 'Laufzeit-Modus', value: stripe.runtimeStripeMode ?? '—', scope: 'platform' },
        { key: 'secret', label: 'API-Schlüssel', value: stripe.stripeSecretConfigured ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'webhook', label: 'Webhook-Signatur', value: stripe.stripeWebhookConfigured ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'customers', label: 'Stripe-Kunden-Mappings', value: String(stripe.stripeCustomerMappingCount ?? 0), scope: 'tenant' },
        { key: 'reconciliation', label: 'Offene Abgleichs-Drifts', value: String(overview?.reconciliationDrifts ?? 0), scope: 'platform' },
      ],
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: 'warning' as const,
      })),
    };
  }

  private async buildEmailDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    const settings = await this.platformEmail.getAdminSettings();
    const orgOverrideCount = await this.prisma.orgEmailSettings.count();
    const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());

    return {
      ...this.toDetailFromEntry(base),
      lastSuccessAt: settings.updatedAt,
      configurationFields: [
        { key: 'provider', label: 'Provider', value: 'Resend', scope: 'platform' },
        { key: 'apiKey', label: 'API-Schlüssel', value: resendConfigured ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'from', label: 'Plattform-Absender', value: `${settings.effectiveFromName} <${settings.effectiveFromEmail}>`, scope: 'platform' },
        { key: 'replyTo', label: 'Reply-To', value: settings.effectiveReplyToEmail ?? '—', scope: 'platform' },
      ],
      tenantImpact: { label: 'Mandanten mit eigener Absender-Konfiguration', count: orgOverrideCount },
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: 'warning' as const,
      })),
    };
  }

  private async buildVoiceDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    const voice = await this.voiceControlPlane.getPlatformStatus();
    const orgCount = await this.prisma.voiceSubscription.count({ where: { archivedAt: null } });

    return {
      ...this.toDetailFromEntry(base),
      lastSuccessAt: voice.checkedAt,
      lastErrorAt: voice.webhooks.dlqCount24h > 0 ? voice.checkedAt : null,
      lastErrorSummary:
        voice.webhooks.dlqCount24h > 0
          ? `${voice.webhooks.dlqCount24h} fehlgeschlagene Webhooks (24h)`
          : null,
      configurationFields: [
        { key: 'elevenLabs', label: 'ElevenLabs', value: voice.providers.elevenLabs.ok ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'twilio', label: 'Twilio IE1', value: voice.providers.twilioIe1.ok ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'mcp', label: 'MCP Gateway', value: voice.providers.mcpGateway.ok ? 'Aktiv' : 'Inaktiv', scope: 'platform' },
        { key: 'backlog', label: 'Webhook-Backlog', value: String(voice.queues.webhookBacklog ?? 0), scope: 'platform' },
      ],
      tenantImpact: { label: 'Mandanten mit Voice-Abonnement', count: orgCount },
      issues: [
        ...voice.activeIncidents.map((inc) => ({
          code: 'PROVIDER_DEGRADED' as IntegrationAttentionCode,
          message: inc.message,
          severity: inc.severity,
        })),
        ...base.attentionCodes
          .filter((c) => c !== 'PROVIDER_DEGRADED')
          .map((code) => ({
            code,
            message: this.attentionMessage(code),
            severity: 'warning' as const,
          })),
      ],
    };
  }

  private async buildWhatsAppDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    const connectedOrgs = await this.prisma.orgWhatsAppConfig.count({ where: { providerStatus: 'CONNECTED' } });
    const simulate = this.isWhatsAppSimulate();

    return {
      ...this.toDetailFromEntry(base),
      configurationFields: [
        { key: 'simulate', label: 'Simulationsmodus', value: simulate ? 'Aktiv' : 'Inaktiv', scope: 'platform' },
        { key: 'token', label: 'Cloud Access Token', value: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
        { key: 'webhook', label: 'Webhook-Secret', value: process.env.WHATSAPP_CLOUD_APP_SECRET?.trim() ? 'Konfiguriert' : 'Nicht konfiguriert', scope: 'platform', secret: true },
      ],
      tenantImpact: { label: 'Mandanten mit verbundenem WhatsApp', count: connectedOrgs },
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: code === 'SIMULATE_MODE_ACTIVE' ? 'warning' as const : 'warning' as const,
      })),
    };
  }

  private async buildHighMobilityDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    return {
      ...this.toDetailFromEntry(base),
      configurationFields: [
        { key: 'healthOauth', label: 'Health App OAuth', value: this.hmConfig.isHealthAppOAuthReady() ? 'Bereit' : 'Unvollständig', scope: 'platform' },
        { key: 'telemetryOauth', label: 'Telemetry App OAuth', value: this.hmConfig.isTelemetryAppOAuthReady() ? 'Bereit' : 'Unvollständig', scope: 'platform' },
        { key: 'healthMqtt', label: 'Health MQTT', value: this.hmConfig.isHealthAppMqttReady() ? 'Bereit' : 'Unvollständig', scope: 'platform' },
        { key: 'telemetryMqtt', label: 'Telemetry MQTT', value: this.hmConfig.isTelemetryAppMqttReady() ? 'Bereit' : 'Unvollständig', scope: 'platform' },
      ],
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: 'warning' as const,
      })),
    };
  }

  private async buildNotificationsDetail(base: PlatformIntegrationDirectoryEntryDto): Promise<PlatformIntegrationDetailDto> {
    return {
      ...this.toDetailFromEntry(base),
      configurationFields: [
        {
          key: 'v2',
          label: 'Notification Engine v2',
          value: process.env.NOTIFICATIONS_V2 === 'true' ? 'Aktiv' : 'Inaktiv',
          scope: 'platform',
        },
      ],
      issues: base.attentionCodes.map((code) => ({
        code,
        message: this.attentionMessage(code),
        severity: 'warning' as const,
      })),
    };
  }

  private toDetailFromEntry(entry: PlatformIntegrationDirectoryEntryDto): PlatformIntegrationDetailDto {
    return {
      id: entry.id,
      name: entry.name,
      purpose: entry.purpose,
      scope: entry.scope,
      environment: entry.environment,
      configuration: entry.configuration,
      authentication: entry.authentication,
      runtimeHealth: entry.runtimeHealth,
      attentionCodes: entry.attentionCodes,
      lastActivityAt: entry.lastActivityAt,
      lastHealthCheckAt: entry.lastHealthCheckAt,
      lastSuccessAt: entry.lastActivityAt,
      lastErrorAt: null,
      lastErrorSummary: null,
      configurationFields: [],
      issues: [],
      drilldownView: entry.drilldownView,
      drilldownParams: entry.drilldownParams,
      moduleError: entry.moduleError,
    };
  }

  private attentionMessage(code: IntegrationAttentionCode): string {
    const map: Record<IntegrationAttentionCode, string> = {
      CONFIG_INCOMPLETE: 'Konfiguration unvollständig',
      AUTH_FAILED: 'Authentifizierung fehlgeschlagen',
      WEBHOOK_FAILURES: 'Webhook-Fehler erkannt',
      RECONCILIATION_DRIFT: 'Abgleichs-Drift offen',
      DELIVERY_FAILURES: 'Zustellfehler bei E-Mails',
      SIMULATE_MODE_ACTIVE: 'Simulationsmodus aktiv — keine echten Sends',
      STALE_DATA: 'Gesundheitsdaten veraltet',
      PROVIDER_DEGRADED: 'Provider eingeschränkt',
    };
    return map[code] ?? code;
  }

  private isWhatsAppSimulate(): boolean {
    return (
      process.env.WHATSAPP_SIMULATE_ENABLED === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_SIMULATE_ENABLED !== 'false')
    );
  }
}

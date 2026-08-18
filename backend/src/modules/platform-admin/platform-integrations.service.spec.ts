import { Test, TestingModule } from '@nestjs/testing';
import { PlatformIntegrationsService } from './platform-integrations.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformAdminService } from './platform-admin.service';
import { BillingAdminService } from '@modules/billing/billing-admin.service';
import { PlatformEmailSettingsService } from '@modules/outbound-email/platform-email-settings.service';
import { PlatformConnectivitySummaryService } from './platform-dashboard.service';
import { HighMobilityAppConfigService } from '@modules/high-mobility/high-mobility-app-config.service';
import { VoiceControlPlaneAdminService } from '@modules/voice-assistant/admin/voice-control-plane-admin.service';

describe('PlatformIntegrationsService', () => {
  let service: PlatformIntegrationsService;

  const platformAdmin = {
    getPlatformHealth: jest.fn(),
  };
  const billingAdmin = {
    getStripeStatus: jest.fn(),
    getOverview: jest.fn(),
  };
  const platformEmail = {
    getAdminSettings: jest.fn(),
    getResolvedDefaults: jest.fn(),
  };
  const connectivity = {
    getPlatformSummary: jest.fn(),
  };
  const hmConfig = {
    isHealthAppOAuthReady: jest.fn().mockReturnValue(true),
    isTelemetryAppOAuthReady: jest.fn().mockReturnValue(false),
    isHealthAppMqttReady: jest.fn().mockReturnValue(true),
    isTelemetryAppMqttReady: jest.fn().mockReturnValue(false),
  };
  const voiceControlPlane = {
    getPlatformStatus: jest.fn(),
  };
  const prisma = {
    orgWhatsAppConfig: { count: jest.fn().mockResolvedValue(0) },
    orgEmailSettings: { count: jest.fn().mockResolvedValue(0) },
    voiceSubscription: { count: jest.fn().mockResolvedValue(0) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DIMO_CLIENT_ID = 'client';
    process.env.DIMO_PRIVATE_KEY = 'key';
    process.env.RESEND_API_KEY = 're_test';

    platformAdmin.getPlatformHealth.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      overallStatus: 'healthy',
      integrations: {
        dimo: {
          connected: 3,
          tokenHealth: { status: 'ok', lastRefreshAt: new Date().toISOString() },
        },
      },
    });
    billingAdmin.getStripeStatus.mockResolvedValue({
      integrationStatus: 'CONNECTED',
      stripeSecretConfigured: true,
      stripeWebhookConfigured: true,
      runtimeStripeMode: 'TEST',
      stripeCustomerMappingCount: 2,
      failedWebhookCount: 0,
      lastWebhookAt: new Date().toISOString(),
      lastSuccessfulWebhookAt: new Date().toISOString(),
    });
    billingAdmin.getOverview.mockResolvedValue({ failedEmailDeliveries: 0, reconciliationDrifts: 0 });
    platformEmail.getAdminSettings.mockResolvedValue({
      effectiveFromEmail: 'noreply@test.com',
      effectiveFromName: 'SynqDrive',
      effectiveReplyToEmail: null,
      updatedAt: new Date().toISOString(),
    });
    voiceControlPlane.getPlatformStatus.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      providers: {
        elevenLabs: { ok: true, label: 'Connected' },
        twilioIe1: { ok: true, label: 'Connected' },
        mcpGateway: { ok: true, label: 'Enabled' },
        webhookIngestion: { ok: true, label: 'Active' },
      },
      queues: { webhookBacklog: 0 },
      webhooks: { dlqCount24h: 0 },
      activeIncidents: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformIntegrationsService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformAdminService, useValue: platformAdmin },
        { provide: BillingAdminService, useValue: billingAdmin },
        { provide: PlatformEmailSettingsService, useValue: platformEmail },
        { provide: PlatformConnectivitySummaryService, useValue: connectivity },
        { provide: HighMobilityAppConfigService, useValue: hmConfig },
        { provide: VoiceControlPlaneAdminService, useValue: voiceControlPlane },
      ],
    }).compile();

    service = module.get(PlatformIntegrationsService);
  });

  it('returns directory with canonical status dimensions', async () => {
    const directory = await service.getDirectory();
    expect(directory.entries.length).toBe(7);
    const stripe = directory.entries.find((e) => e.id === 'stripe');
    expect(stripe?.environment).toBe('test');
    expect(stripe?.configuration).toBe('complete');
    expect(directory.environmentSummary.stripeMode).toBe('TEST');
  });

  it('aggregates attention summary', async () => {
    const attention = await service.getAttentionSummary();
    expect(attention.generatedAt).toBeTruthy();
    expect(Array.isArray(attention.topItems)).toBe(true);
  });
});

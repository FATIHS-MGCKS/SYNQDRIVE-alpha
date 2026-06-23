import { WhatsAppProviderService } from './whatsapp-provider.service';
import { MetaWhatsAppCloudProvider } from './meta-whatsapp-cloud.provider';
import { WhatsAppProviderNotConfiguredException } from '../utils/whatsapp-errors';

describe('WhatsAppProviderService', () => {
  const configService = {
    get: jest.fn((key: string, def?: string) => {
      if (key === 'whatsapp.cloudAccessToken') return '';
      if (key === 'whatsapp.cloudAppSecret') return '';
      return def ?? '';
    }),
  };

  const meta = new MetaWhatsAppCloudProvider();
  let service: WhatsAppProviderService;

  const baseOrgConfig = {
    organizationId: 'org-1',
    phoneNumberId: null,
    wabaId: null,
    accessTokenConfigured: false,
    appSecretConfigured: false,
    webhookVerifyToken: 'verify-token',
    metaApiVersion: 'v21.0',
  } as any;

  beforeEach(() => {
    service = new WhatsAppProviderService(configService as any, meta);
    delete process.env['WHATSAPP_TOKEN_org-1'];
    delete process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  });

  it('reports not configured when credentials missing', () => {
    expect(service.isConfigured(baseOrgConfig)).toBe(false);
  });

  it('throws WHATSAPP_PROVIDER_NOT_CONFIGURED on send when not configured', async () => {
    await expect(
      service.sendTextMessage(baseOrgConfig, '+491701234567', 'Hello', {
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(WhatsAppProviderNotConfiguredException);
  });

  it('resolves per-org token from environment', () => {
    process.env['WHATSAPP_TOKEN_org-1'] = 'secret-token';
    const runtime = service.resolveRuntimeConfig({
      ...baseOrgConfig,
      phoneNumberId: 'pn-1',
      accessTokenConfigured: true,
    });
    expect(runtime.accessToken).toBe('secret-token');
    expect(service.isConfigured({ ...baseOrgConfig, phoneNumberId: 'pn-1', accessTokenConfigured: true })).toBe(true);
  });
});

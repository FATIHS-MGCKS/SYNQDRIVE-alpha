import { CommunicationProjectionFeatureService } from './communication-projection-feature.service';
import communicationProjectionConfig from '@config/communication-projection.config';

describe('CommunicationProjectionFeatureService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createService(env: Record<string, string | undefined>) {
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = env[key];
      }
    }
    const config = communicationProjectionConfig();
    const configService = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'communicationProjection.whatsappEnabled') return config.whatsappEnabled;
        if (key === 'communicationProjection.orgAllowlist') return config.orgAllowlist;
        return fallback;
      },
    };
    return new CommunicationProjectionFeatureService(configService as any);
  }

  it('is disabled when global and WhatsApp flags are OFF', () => {
    const service = createService({
      COMMUNICATION_CENTER_PROJECTION_ENABLED: undefined,
      COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED: undefined,
      COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST: undefined,
    });
    expect(service.isWhatsAppProjectionEnabled('org-1')).toBe(false);
  });

  it('is enabled when global flag is ON', () => {
    const service = createService({
      COMMUNICATION_CENTER_PROJECTION_ENABLED: 'true',
      COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED: undefined,
    });
    expect(service.isWhatsAppProjectionEnabled('org-1')).toBe(true);
  });

  it('is enabled when WhatsApp flag is ON', () => {
    const service = createService({
      COMMUNICATION_CENTER_PROJECTION_ENABLED: undefined,
      COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED: 'true',
    });
    expect(service.isWhatsAppProjectionEnabled('org-1')).toBe(true);
  });

  it('is disabled for org absent from allowlist when allowlist configured', () => {
    const service = createService({
      COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED: 'true',
      COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST: 'org-allowed',
    });
    expect(service.isWhatsAppProjectionEnabled('org-other')).toBe(false);
  });

  it('is enabled for org present in allowlist when allowlist configured', () => {
    const service = createService({
      COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED: 'true',
      COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST: 'org-allowed,org-two',
    });
    expect(service.isWhatsAppProjectionEnabled('org-allowed')).toBe(true);
  });
});

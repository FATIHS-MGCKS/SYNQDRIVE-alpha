import { buildCanonicalAgentConfigFromAssistant } from './agent-config.builder';
import { AgentDeploymentReadinessService } from './agent-deployment-readiness.service';

const ORG_ID = 'org-ready-1';

function makePrisma() {
  return {
    voiceAssistant: { findUnique: jest.fn().mockResolvedValue({ escalationPhone: '+491234567890' }) },
    station: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationRole: { findFirst: jest.fn().mockResolvedValue(null) },
    voicePhoneNumber: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  const assistant = {
    organizationId: ORG_ID,
    name: 'Assistant',
    language: 'de',
    voiceId: 'voice-1',
    systemPrompt: 'Prompt',
    greetingMessage: 'Hello',
    escalationPhone: '+491234567890',
    escalateOnRequest: true,
    escalateOnLowConf: false,
    escalateOnSensitive: false,
    fallbackMessage: 'Fallback',
    ...overrides,
  } as any;
  return buildCanonicalAgentConfigFromAssistant(assistant);
}

describe('AgentDeploymentReadinessService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TWILIO_VOICE_WEBHOOK_BASE_URL = 'https://app.synqdrive.eu';
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks deploy when webhook secret is missing', async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    const service = new AgentDeploymentReadinessService(makePrisma());
    const result = await service.evaluate(ORG_ID, makeConfig(), { forDeploy: true });
    expect(result.ready).toBe(false);
    expect(result.blockers.some((item) => item.key === 'postCallWebhookSecret')).toBe(true);
  });

  it('blocks deploy when mandatory escalation has no resolvable transfer target', async () => {
    const prisma = makePrisma();
    prisma.voiceAssistant.findUnique.mockResolvedValue({ escalationPhone: null, phoneNumber: null });
    const service = new AgentDeploymentReadinessService(prisma);
    const config = makeConfig({ escalationPhone: null, escalateOnRequest: true });
    config.transfer = { rules: [], maxTransferHops: 2, loopProtectionEnabled: true };

    const result = await service.evaluate(ORG_ID, config, { forDeploy: true });
    expect(result.blockers.some((item) => item.key === 'transferTarget')).toBe(true);
  });

  it('warns when privacy consent notice is missing', async () => {
    const service = new AgentDeploymentReadinessService(makePrisma());
    const config = makeConfig();
    config.privacyRetention.consentNoticeText = null;

    const result = await service.evaluate(ORG_ID, config, { forDeploy: true });
    expect(result.warnings.some((item) => item.key === 'privacyConsentNotice')).toBe(true);
  });

  it('warns when retention windows are not configured', async () => {
    const service = new AgentDeploymentReadinessService(makePrisma());
    const config = makeConfig();
    config.privacyRetention = {
      ...config.privacyRetention,
      retentionAudioDays: null,
      retentionTranscriptDays: null,
      retentionSummaryDays: null,
      retentionProviderPayloadDays: null,
      retentionDays: null,
    };

    const result = await service.evaluate(ORG_ID, config, { forDeploy: true });
    expect(result.warnings.some((item) => item.key === 'retentionPolicy')).toBe(true);
  });

  it('reports ready when transfer, webhook, and fallback requirements are satisfied', async () => {
    const service = new AgentDeploymentReadinessService(makePrisma());
    const config = makeConfig();
    config.privacyRetention.consentNoticeText = 'Calls may be recorded for quality.';

    const result = await service.evaluate(ORG_ID, config, { forDeploy: true });
    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});

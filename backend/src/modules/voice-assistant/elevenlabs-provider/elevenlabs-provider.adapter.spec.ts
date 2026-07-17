import { ConfigService } from '@nestjs/config';
import { VoiceControlPlaneProvider } from '@prisma/client';
import { ElevenLabsProviderAdapter } from './elevenlabs-provider.adapter';
import { ElevenLabsProviderHttpClient } from './elevenlabs-provider.http-client';
import {
  ElevenLabsRateLimitedError,
  ElevenLabsResourceNotFoundError,
  ElevenLabsTenantIsolationViolationError,
  ElevenLabsUnauthorizedError,
} from './elevenlabs-provider.errors';
import { ElevenLabsProviderTenantResolver } from './elevenlabs-provider.tenant-resolver';

const ORG_ID = 'org-eleven-1';
const DEPLOYMENT_ID = 'dep-1';
const PHONE_ID = 'phone-1';
const AGENT_EXTERNAL = 'agent_abcdefghijklmnop';
const PHONE_EXTERNAL = 'phnum_abcdefghijklmnop';

function makeConfig(apiKey = 'test-api-key') {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'ELEVENLABS_API_KEY') return apiKey;
      if (key === 'ELEVENLABS_BASE_URL') return 'https://api.elevenlabs.io/v1';
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

function makePrisma() {
  return {
    voiceAgentDeployment: {
      findFirst: jest.fn(),
    },
    voicePhoneNumber: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function makeAdapter(fetchFn: jest.Mock, prisma = makePrisma()) {
  const config = makeConfig();
  const http = new ElevenLabsProviderHttpClient(config, fetchFn);
  const tenantResolver = new ElevenLabsProviderTenantResolver(prisma);
  const adapter = new ElevenLabsProviderAdapter(http, tenantResolver);
  return { adapter, prisma, fetchFn };
}

describe('ElevenLabsProviderAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not perform network requests on module import', () => {
    const fetchSpy = jest.fn();
    const config = makeConfig('');
    expect(() => new ElevenLabsProviderHttpClient(config, fetchSpy)).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('checkHealth', () => {
    it('reports not configured when API key is missing', async () => {
      const fetchFn = jest.fn();
      const { adapter } = makeAdapter(fetchFn, makePrisma());
      const config = makeConfig('');
      const http = new ElevenLabsProviderHttpClient(config, fetchFn);
      const tenantResolver = new ElevenLabsProviderTenantResolver(makePrisma());
      const unconfigured = new ElevenLabsProviderAdapter(http, tenantResolver);

      const health = await unconfigured.checkHealth();

      expect(health).toMatchObject({
        configured: false,
        reachable: false,
        authorized: false,
        degraded: false,
        healthy: false,
        connectionStatus: 'NOT_CONFIGURED',
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('reports healthy when user endpoint succeeds', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ user_id: 'u1' }));
      const { adapter } = makeAdapter(fetchFn);

      const health = await adapter.checkHealth();

      expect(health).toMatchObject({
        configured: true,
        reachable: true,
        authorized: true,
        degraded: false,
        healthy: true,
        connectionStatus: 'CONNECTED',
      });
      expect(fetchFn).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/user',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('reports degraded on unauthorized credentials', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(jsonResponse({ detail: 'invalid' }, 401));
      const { adapter } = makeAdapter(fetchFn);

      const health = await adapter.checkHealth();

      expect(health).toMatchObject({
        configured: true,
        reachable: true,
        authorized: false,
        degraded: true,
        healthy: false,
        connectionStatus: 'DEGRADED',
      });
    });

    it('times out slow health checks without hanging', async () => {
      const fetchFn = jest.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          }),
      );
      const { adapter } = makeAdapter(fetchFn);

      const health = await adapter.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.configured).toBe(true);
    });
  });

  describe('provider errors', () => {
    it('maps rate limited responses through HTTP client', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ detail: 'rate limit' }, 429))
        .mockResolvedValueOnce(jsonResponse({ detail: 'rate limit' }, 429))
        .mockResolvedValueOnce(jsonResponse({ detail: 'rate limit' }, 429));
      const { adapter } = makeAdapter(fetchFn);

      await expect(
        adapter.listVoices(),
      ).rejects.toBeInstanceOf(ElevenLabsRateLimitedError);
    });

    it('rejects foreign agent conversation references', async () => {
      const prisma = makePrisma();
      prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        organizationId: ORG_ID,
        maskedExternalRef: 'agen***mnop',
        protectedExternalRef: AGENT_EXTERNAL,
        voiceAssistant: { elevenLabsAgentId: AGENT_EXTERNAL },
      });

      const fetchFn = jest.fn().mockResolvedValue(
        jsonResponse({
          conversation_id: 'conv-1',
          agent_id: 'agent_foreign_other_org',
          status: 'done',
        }),
      );
      const { adapter } = makeAdapter(fetchFn, prisma);

      await expect(
        adapter.getConversation({
          organizationId: ORG_ID,
          deploymentId: DEPLOYMENT_ID,
          conversationId: 'conv-1',
        }),
      ).rejects.toBeInstanceOf(ElevenLabsResourceNotFoundError);
    });

    it('rejects tenant isolation violations for unknown deployments', async () => {
      const prisma = makePrisma();
      prisma.voiceAgentDeployment.findFirst.mockResolvedValue(null);
      const fetchFn = jest.fn();
      const { adapter } = makeAdapter(fetchFn, prisma);

      await expect(
        adapter.getAgent({ organizationId: ORG_ID, deploymentId: 'foreign-dep' }),
      ).rejects.toBeInstanceOf(ElevenLabsTenantIsolationViolationError);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('payload redaction', () => {
    it('returns masked conversation views without raw provider ids', async () => {
      const prisma = makePrisma();
      prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        organizationId: ORG_ID,
        maskedExternalRef: 'agen***mnop',
        protectedExternalRef: AGENT_EXTERNAL,
        voiceAssistant: { elevenLabsAgentId: AGENT_EXTERNAL },
      });

      const fetchFn = jest.fn().mockResolvedValue(
        jsonResponse({
          conversation_id: 'conv_secret_1234567890',
          agent_id: AGENT_EXTERNAL,
          status: 'done',
          transcript: 'hello',
        }),
      );
      const { adapter } = makeAdapter(fetchFn, prisma);

      const view = await adapter.getConversation({
        organizationId: ORG_ID,
        deploymentId: DEPLOYMENT_ID,
        conversationId: 'conv_secret_1234567890',
      });

      expect(view.maskedConversationRef).not.toContain('conv_secret_1234567890');
      expect(view.maskedAgentRef).not.toContain(AGENT_EXTERNAL);
      expect(view.hasTranscript).toBe(true);
    });
  });

  describe('prepareOutboundCall', () => {
    it('blocks outbound preparation when tenant refs are missing', async () => {
      const prisma = makePrisma();
      prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        organizationId: ORG_ID,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
        protectedExternalRef: null,
        maskedExternalRef: null,
        voiceAssistant: { elevenLabsAgentId: null },
      });
      prisma.voicePhoneNumber.findFirst.mockResolvedValue(null);

      const fetchFn = jest.fn();
      const { adapter } = makeAdapter(fetchFn, prisma);

      const prep = await adapter.prepareOutboundCall({
        organizationId: ORG_ID,
        deploymentId: DEPLOYMENT_ID,
        phoneNumberId: PHONE_ID,
        toE164: '+491701234567',
      });

      expect(prep.ready).toBe(false);
      expect(prep.blockers.length).toBeGreaterThan(0);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});

describe('ElevenLabsProviderHttpClient unauthorized', () => {
  it('throws ElevenLabsUnauthorizedError for 403 responses', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ detail: 'forbidden' }, 403));
    const http = new ElevenLabsProviderHttpClient(makeConfig(), fetchFn);

    await expect(http.request('/voices')).rejects.toBeInstanceOf(ElevenLabsUnauthorizedError);
  });
});

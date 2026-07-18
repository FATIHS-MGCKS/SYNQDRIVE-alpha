import { VoiceSecretsStartupService } from './voice-secrets-startup.service';

describe('VoiceSecretsStartupService', () => {
  it('does not log secret values during evaluation', () => {
    const service = new VoiceSecretsStartupService({ get: jest.fn() } as never);
    const checks = service.evaluate({
      NODE_ENV: 'development',
      ELEVENLABS_API_KEY: 'sk-test-should-not-appear',
      JWT_SECRET: 'jwt-secret',
    });

    const serialized = JSON.stringify(checks);
    expect(serialized).not.toContain('sk-test-should-not-appear');
    expect(serialized).not.toContain('jwt-secret');
    expect(checks.find((check) => check.key === 'ELEVENLABS_API_KEY')?.configured).toBe(true);
  });

  it('does not require webhook secrets in production when ingestion is disabled by default', () => {
    const service = new VoiceSecretsStartupService({ get: jest.fn() } as never);
    const checks = service.evaluate({
      NODE_ENV: 'production',
      ELEVENLABS_API_KEY: 'set',
      TWILIO_AUTH_TOKEN: 'set',
    });

    const webhookSecret = checks.find((check) => check.key === 'ELEVENLABS_WEBHOOK_SECRET');
    expect(webhookSecret?.required).toBe(false);
  });

  it('requires dedicated MCP secret in production when gateway enabled', () => {
    const service = new VoiceSecretsStartupService({ get: jest.fn() } as never);
    const checks = service.evaluate({
      NODE_ENV: 'production',
      VOICE_AI_MCP_GATEWAY_ENABLED: 'true',
      VOICE_MCP_TOKEN_SECRET: '',
      JWT_SECRET: 'fallback',
      ELEVENLABS_API_KEY: 'set',
      ELEVENLABS_WEBHOOK_SECRET: 'set',
      TWILIO_AUTH_TOKEN: 'set',
    });

    const mcp = checks.find((check) => check.key === 'VOICE_MCP_TOKEN_SECRET');
    expect(mcp?.required).toBe(true);
    expect(mcp?.configured).toBe(false);
  });
});

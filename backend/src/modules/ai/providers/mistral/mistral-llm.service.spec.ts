import { MistralLlmService } from './mistral-llm.service';
import { MistralSdkClientProvider } from './mistral-sdk-client.provider';

describe('MistralLlmService', () => {
  const baseConfig = {
    provider: 'mistral' as const,
    mistralApiKey: 'test-key',
    mistralBaseUrl: undefined,
    mistralRouterModel: 'router-model',
    mistralChatModel: 'chat-model',
    mistralJsonModel: 'json-model',
    mistralReasoningModel: 'reasoning-model',
    mistralOcrModel: 'mistral-ocr-latest',
    mistralOcrTimeoutMs: 120_000,
    mistralOcrMaxFileBytes: 10 * 1024 * 1024,
    streamingEnabled: true,
    externalActionsRequireApproval: true,
  };

  function makeClientProvider(configured = true) {
    return {
      isConfigured: jest.fn().mockReturnValue(configured),
      getClient: jest.fn(),
    } as unknown as MistralSdkClientProvider;
  }

  it('reports configured when API key is present', () => {
    const svc = new MistralLlmService(baseConfig as any, makeClientProvider());
    expect(svc.isConfigured()).toBe(true);
    expect(svc.providerId).toBe('mistral');
  });

  it('resolves models by purpose', () => {
    const svc = new MistralLlmService(baseConfig as any, makeClientProvider());
    expect(svc.resolveModel('router')).toBe('router-model');
    expect(svc.resolveModel('json')).toBe('json-model');
    expect(svc.resolveModel('reasoning')).toBe('reasoning-model');
    expect(svc.resolveModel('chat')).toBe('chat-model');
    expect(svc.resolveModel(undefined, 'override')).toBe('override');
  });
});

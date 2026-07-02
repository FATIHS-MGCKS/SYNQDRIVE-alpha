import { MistralLlmService } from './mistral-llm.service';

describe('MistralLlmService', () => {
  const baseConfig = {
    provider: 'mistral' as const,
    mistralApiKey: 'test-key',
    mistralBaseUrl: undefined,
    mistralRouterModel: 'router-model',
    mistralChatModel: 'chat-model',
    mistralJsonModel: 'json-model',
    mistralReasoningModel: 'reasoning-model',
    streamingEnabled: true,
    externalActionsRequireApproval: true,
  };

  it('reports configured when API key is present', () => {
    const svc = new MistralLlmService(baseConfig as any);
    expect(svc.isConfigured()).toBe(true);
    expect(svc.providerId).toBe('mistral');
  });

  it('resolves models by purpose', () => {
    const svc = new MistralLlmService(baseConfig as any);
    expect(svc.resolveModel('router')).toBe('router-model');
    expect(svc.resolveModel('json')).toBe('json-model');
    expect(svc.resolveModel('reasoning')).toBe('reasoning-model');
    expect(svc.resolveModel('chat')).toBe('chat-model');
    expect(svc.resolveModel(undefined, 'override')).toBe('override');
  });
});

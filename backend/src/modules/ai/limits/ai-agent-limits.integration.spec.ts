import { AiAgentLimitException } from './ai-agent-limit.errors';
import { AiAgentConcurrencyService } from './ai-agent-concurrency.service';
import { AiAgentLimitsService } from './ai-agent-limits.service';
import { AiAgentRateLimitService } from './ai-agent-rate-limit.service';
import { AiAgentTokenBudgetService } from './ai-agent-token-budget.service';
import { AiLlmCircuitBreakerService } from './ai-llm-circuit-breaker.service';

const baseConfig = {
  agentLimitsEnabled: true,
  agentLimitsFailOpen: false,
  agentRateLimitEnabled: true,
  agentRateLimitWindowMs: 60_000,
  agentRateLimitPerUserPerMinute: 30,
  agentRateLimitPerOrgPerMinute: 120,
  agentRateLimitPerIpPerMinute: 60,
  agentMaxConcurrentPerOrg: 5,
  agentMaxConcurrentPerUser: 2,
  agentMaxToolInvocationsPerChatRequest: 8,
  agentMaxLlmRetries: 1,
  agentMaxTokensPerLlmCall: 768,
  agentTokenBudgetEnabled: true,
  agentTokenBudgetPerUserPerDay: 1_000,
  agentTokenBudgetPerOrgPerDay: 5_000,
  agentMaxConversationHistory: 100,
  agentRequestTimeoutMs: 45_000,
  agentCircuitBreakerFailureThreshold: 2,
  agentCircuitBreakerCooldownMs: 60_000,
};

function createMemoryRedis() {
  const store = new Map<string, string>();
  return {
    incr: jest.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    pexpire: jest.fn(),
    eval: jest.fn(async (script: string, numKeys: number, ...args: string[]) => {
      if (numKeys === 1) {
        const [key, limitRaw] = args;
        const limit = parseInt(limitRaw, 10);
        const current = parseInt(store.get(key) ?? '0', 10);
        if (current >= limit) return 0;
        const next = current + 1;
        store.set(key, String(next));
        return 1;
      }

      if (numKeys === 2 && script.includes('INCRBY')) {
        const [orgKey, userKey, incrRaw] = args;
        const incr = parseInt(incrRaw, 10);
        store.set(orgKey, String(parseInt(store.get(orgKey) ?? '0', 10) + incr));
        store.set(userKey, String(parseInt(store.get(userKey) ?? '0', 10) + incr));
        return 1;
      }

      if (numKeys === 2) {
        const [orgKey, userKey, orgLimitRaw, userLimitRaw, incrRaw] = args;
        const orgLimit = parseInt(orgLimitRaw, 10);
        const userLimit = parseInt(userLimitRaw, 10);
        const incr = parseInt(incrRaw, 10);
        const orgCurrent = parseInt(store.get(orgKey) ?? '0', 10);
        const userCurrent = parseInt(store.get(userKey) ?? '0', 10);

        if (orgCurrent + incr > orgLimit || userCurrent + incr > userLimit) {
          return 0;
        }

        return 1;
      }

      return 0;
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('AiAgentLimitsService integration', () => {
  it('throws rate_limit when user quota is exhausted', async () => {
    const redis = createMemoryRedis();
    const config = {
      ...baseConfig,
      agentRateLimitPerUserPerMinute: 1,
    };
    const rateLimit = new AiAgentRateLimitService(config as never, redis as never);
    const concurrency = new AiAgentConcurrencyService(config as never, redis as never);
    const tokenBudget = new AiAgentTokenBudgetService(config as never, redis as never);
    const limits = new AiAgentLimitsService(
      config as never,
      rateLimit,
      concurrency,
      tokenBudget,
    );

    await limits.acquireChatRequest({
      organizationId: 'org-1',
      userId: 'user-1',
      correlationId: 'corr-1',
      clientIp: null,
    });
    await limits.releaseChatRequest({
      organizationId: 'org-1',
      userId: 'user-1',
      slotKey: 'synqdrive:ai-chat:concurrent:org:org-1|synqdrive:ai-chat:concurrent:user:user-1',
    });

    await expect(
      limits.acquireChatRequest({
        organizationId: 'org-1',
        userId: 'user-1',
        correlationId: 'corr-2',
        clientIp: null,
      }),
    ).rejects.toMatchObject({
      kind: 'rate_limit',
      userMessage: expect.objectContaining({
        de: expect.stringContaining('Zu viele Anfragen'),
      }),
    });
  });

  it('throws concurrency_limit when parallel user slots are full', async () => {
    const redis = createMemoryRedis();
    const config = {
      ...baseConfig,
      agentRateLimitEnabled: false,
      agentMaxConcurrentPerUser: 1,
    };
    const rateLimit = new AiAgentRateLimitService(config as never, redis as never);
    const concurrency = new AiAgentConcurrencyService(config as never, redis as never);
    const tokenBudget = new AiAgentTokenBudgetService(config as never, redis as never);
    const limits = new AiAgentLimitsService(
      config as never,
      rateLimit,
      concurrency,
      tokenBudget,
    );

    const slot = await limits.acquireChatRequest({
      organizationId: 'org-1',
      userId: 'user-1',
      correlationId: 'corr-1',
      clientIp: null,
    });
    expect(slot).toBeTruthy();

    await expect(
      limits.acquireChatRequest({
        organizationId: 'org-1',
        userId: 'user-1',
        correlationId: 'corr-2',
        clientIp: null,
      }),
    ).rejects.toMatchObject({
      kind: 'concurrency_limit',
    });

    await limits.releaseChatRequest(slot);
  });

  it('throws budget_exceeded before LLM invocation', async () => {
    const redis = createMemoryRedis();
    const config = {
      ...baseConfig,
      agentRateLimitEnabled: false,
      agentTokenBudgetPerUserPerDay: 100,
      agentTokenBudgetPerOrgPerDay: 500,
    };
    const rateLimit = new AiAgentRateLimitService(config as never, redis as never);
    const concurrency = new AiAgentConcurrencyService(config as never, redis as never);
    const tokenBudget = new AiAgentTokenBudgetService(config as never, redis as never);
    const limits = new AiAgentLimitsService(
      config as never,
      rateLimit,
      concurrency,
      tokenBudget,
    );

    await tokenBudget.recordUsage({
      organizationId: 'org-1',
      userId: 'user-1',
      usage: { promptTokens: 90, completionTokens: 10, totalTokens: 100 },
    });

    await expect(
      limits.assertLlmBudget({
        organizationId: 'org-1',
        userId: 'user-1',
        estimatedTokens: 50,
      }),
    ).rejects.toMatchObject({
      kind: 'budget_exceeded',
    });
  });

  it('maps request timeout to user-facing limit error', () => {
    const redis = createMemoryRedis();
    const config = { ...baseConfig, agentRequestTimeoutMs: 1 };
    const limits = new AiAgentLimitsService(
      config as never,
      new AiAgentRateLimitService(config as never, redis as never),
      new AiAgentConcurrencyService(config as never, redis as never),
      new AiAgentTokenBudgetService(config as never, redis as never),
    );

    const resolved = limits.resolveLimitError(new Error('AI_CHAT_REQUEST_TIMEOUT'), 'de');
    expect(resolved).toBeInstanceOf(AiAgentLimitException);
    expect(resolved?.kind).toBe('request_timeout');
  });
});

describe('AiLlmCircuitBreakerService integration', () => {
  it('opens after repeated provider failures', () => {
    const svc = new AiLlmCircuitBreakerService({
      agentLimitsEnabled: true,
      agentCircuitBreakerFailureThreshold: 2,
      agentCircuitBreakerCooldownMs: 60_000,
    } as never);

    svc.recordFailure();
    svc.recordFailure();

    expect(() => svc.assertCanInvokeLlm()).toThrow(AiAgentLimitException);
    try {
      svc.assertCanInvokeLlm();
    } catch (error) {
      expect(error).toMatchObject({ kind: 'circuit_breaker_open' });
    }
  });
});

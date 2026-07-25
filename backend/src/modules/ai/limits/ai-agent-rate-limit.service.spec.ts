import { AiAgentRateLimitService } from './ai-agent-rate-limit.service';

describe('AiAgentRateLimitService', () => {
  const config = {
    agentLimitsEnabled: true,
    agentRateLimitEnabled: true,
    agentRateLimitWindowMs: 60_000,
    agentRateLimitPerUserPerMinute: 2,
    agentRateLimitPerOrgPerMinute: 100,
    agentRateLimitPerIpPerMinute: 100,
    agentLimitsFailOpen: true,
  };

  function createRedisMock() {
    const counts = new Map<string, number>();
    return {
      incr: jest.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
      pexpire: jest.fn(),
    };
  }

  it('blocks when per-user limit exceeded', async () => {
    const redis = createRedisMock();
    const svc = new AiAgentRateLimitService(config as never, redis as never);
    const input = {
      organizationId: 'org-1',
      userId: 'user-1',
      clientIp: null,
    };

    await expect(svc.assertWithinLimits(input)).resolves.toBeNull();
    await expect(svc.assertWithinLimits(input)).resolves.toBeNull();
    const violation = await svc.assertWithinLimits(input);
    expect(violation?.kind).toBe('rate_limit');
    expect(violation?.scope).toBe('user');
  });

  it('blocks supplementary per-ip limit when configured', async () => {
    const redis = createRedisMock();
    const svc = new AiAgentRateLimitService(
      {
        ...config,
        agentRateLimitPerIpPerMinute: 1,
      } as never,
      redis as never,
    );
    const input = {
      organizationId: 'org-1',
      userId: 'user-1',
      clientIp: '203.0.113.10',
    };

    await expect(svc.assertWithinLimits(input)).resolves.toBeNull();
    const violation = await svc.assertWithinLimits(input);
    expect(violation?.kind).toBe('rate_limit');
    expect(violation?.scope).toBe('ip');
  });
});

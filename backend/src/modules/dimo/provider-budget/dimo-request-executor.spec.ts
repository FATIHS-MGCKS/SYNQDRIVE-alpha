import { DimoRequestExecutor } from './dimo-request-executor.service';
import { DimoProviderBudgetService } from './dimo-provider-budget.service';
import { runWithDimoRequestContext } from './dimo-request-context';

describe('DimoRequestExecutor', () => {
  it('AB — no double acquire when nested in same context', async () => {
    const acquire = jest.fn(async () => ({
      token: 't1',
      category: 'LIVE_SNAPSHOT' as const,
      acquiredAt: Date.now(),
    }));
    const release = jest.fn(async () => undefined);
    const budget = {
      isEnabled: () => true,
      getConfig: () => ({
        globalMaxRetries: 0,
        globalRetryAfterMaxMs: 60_000,
      }),
      getMetrics: () => ({
        requestsTotal: { inc: jest.fn() },
        requestDurationSeconds: { observe: jest.fn() },
        rateLimitedTotal: { inc: jest.fn() },
        retryAfterSeconds: { observe: jest.fn() },
      }),
      acquirePermit: acquire,
      releasePermit: release,
      record429: jest.fn(),
    } as unknown as DimoProviderBudgetService;

    const executor = new DimoRequestExecutor(budget);

    await runWithDimoRequestContext(
      { category: 'LIVE_SNAPSHOT', priority: 'HIGH' },
      async () => {
        await executor.execute({
          execute: async () => {
            await executor.execute({ execute: async () => 'ok' });
            return 'outer';
          },
        });
      },
    );

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('R/S — permit released on success and exception', async () => {
    const release = jest.fn(async () => undefined);
    const budget = {
      isEnabled: () => true,
      getConfig: () => ({
        globalMaxRetries: 0,
        globalRetryAfterMaxMs: 60_000,
      }),
      getMetrics: () => ({
        requestsTotal: { inc: jest.fn() },
        requestDurationSeconds: { observe: jest.fn() },
        rateLimitedTotal: { inc: jest.fn() },
        retryAfterSeconds: { observe: jest.fn() },
      }),
      acquirePermit: jest.fn(async () => ({
        token: 't1',
        category: 'LIVE_SNAPSHOT' as const,
        acquiredAt: Date.now(),
      })),
      releasePermit: release,
      record429: jest.fn(),
    } as unknown as DimoProviderBudgetService;

    const executor = new DimoRequestExecutor(budget);

    await expect(
      executor.execute({ execute: async () => {
        throw new Error('boom');
      } }),
    ).rejects.toThrow('boom');
    expect(release).toHaveBeenCalledTimes(1);

    await executor.execute({ execute: async () => 'ok' });
    expect(release).toHaveBeenCalledTimes(2);
  });
});

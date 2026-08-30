import { Registry } from 'prom-client';
import { DimoProviderBudgetService } from './dimo-provider-budget.service';
import type { DimoProviderBudgetConfigShape } from './dimo-provider-budget.config';
import {
  DIMO_BUDGET_ACQUIRE_SCRIPT,
  DIMO_BUDGET_LEASES_KEY,
  DIMO_BUDGET_RELEASE_SCRIPT,
} from './dimo-provider-budget.redis';

function buildConfig(
  overrides: Partial<DimoProviderBudgetConfigShape> = {},
): DimoProviderBudgetConfigShape {
  return {
    globalBudgetEnabled: true,
    globalMaxInFlight: 10,
    globalAcquireTimeoutMs: 500,
    globalLeaseMs: 30_000,
    globalRetryAfterMaxMs: 120_000,
    globalMaxRetries: 3,
    reservedHighPrioritySlots: 2,
    starvationPromotionMs: 30_000,
    providerCooldown429Threshold: 5,
    providerCooldownMs: 30_000,
    acquirePollIntervalMs: 10,
    ...overrides,
  };
}

describe('DimoProviderBudgetService', () => {
  const leases = new Map<string, number>();
  let redis: {
    eval: jest.Mock;
    set: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let service: DimoProviderBudgetService;

  beforeEach(() => {
    leases.clear();
    redis = {
      eval: jest.fn(async (script: string, _numKeys: number, ...args: string[]) => {
        if (script === DIMO_BUDGET_ACQUIRE_SCRIPT) {
          const nowMs = Number(args[2]);
          const leaseExpiryMs = Number(args[3]);
          const maxInFlight = Number(args[4]);
          const token = args[5];
          const priorityNumeric = Number(args[6]);
          const lowPriorityCap = Number(args[7]);

          for (const [member, score] of [...leases.entries()]) {
            if (score <= nowMs) leases.delete(member);
          }
          const inFlight = leases.size;
          if (inFlight >= maxInFlight) return [0, 'at_limit'];
          if (priorityNumeric >= 4 && inFlight >= lowPriorityCap) {
            return [0, 'low_priority_cap'];
          }
          leases.set(token, leaseExpiryMs);
          return [1, token];
        }
        if (script === DIMO_BUDGET_RELEASE_SCRIPT) {
          const token = args[2];
          const removed = leases.delete(token) ? 1 : 0;
          return removed;
        }
        return 0;
      }),
      set: jest.fn(),
      incr: jest.fn(async () => 1),
      expire: jest.fn(),
    };

    const tripMetrics = {
      registry: new Registry(),
    };

    service = new DimoProviderBudgetService(
      buildConfig(),
      redis as any,
      tripMetrics as any,
    );
    service.onModuleInit();
  });

  it('A — acquire below limit', async () => {
    const permit = await service.acquirePermit({
      category: 'LIVE_SNAPSHOT',
      priority: 'HIGH',
    });
    expect(permit.token).toBeTruthy();
    await service.releasePermit(permit);
  });

  it('C — 11th blocks when limit=10', async () => {
    const active: Awaited<ReturnType<DimoProviderBudgetService['acquirePermit']>>[] = [];
    for (let i = 0; i < 10; i += 1) {
      active.push(
        await service.acquirePermit({ category: 'LIVE_SNAPSHOT', priority: 'HIGH' }),
      );
    }

    await expect(
      service.acquirePermit({
        category: 'LIVE_SNAPSHOT',
        priority: 'HIGH',
        acquireTimeoutMs: 50,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    for (const permit of active) {
      await service.releasePermit(permit);
    }
  });

  it('D/E — release frees slot; double release safe', async () => {
    const permit = await service.acquirePermit({
      category: 'ACTIVE_TRIP',
      priority: 'CRITICAL',
    });
    await service.releasePermit(permit);
    await service.releasePermit(permit);
    const again = await service.acquirePermit({
      category: 'ACTIVE_TRIP',
      priority: 'CRITICAL',
    });
    await service.releasePermit(again);
  });

  it('F/G — lease expires and slot recovers', async () => {
    const permit = await service.acquirePermit({
      category: 'LIVE_SNAPSHOT',
      priority: 'HIGH',
    });
    leases.set(permit.token, Date.now() - 1);
    const next = await service.acquirePermit({
      category: 'LIVE_SNAPSHOT',
      priority: 'HIGH',
    });
    await service.releasePermit(next);
  });

  it('H — two instances share global limit', async () => {
    const serviceB = new DimoProviderBudgetService(
      buildConfig(),
      redis as any,
      { registry: new Registry() } as any,
    );
    serviceB.onModuleInit();

    const permitsA: Awaited<ReturnType<DimoProviderBudgetService['acquirePermit']>>[] = [];
    for (let i = 0; i < 7; i += 1) {
      permitsA.push(
        await service.acquirePermit({ category: 'LIVE_SNAPSHOT', priority: 'HIGH' }),
      );
    }
    const permitsB: Awaited<ReturnType<DimoProviderBudgetService['acquirePermit']>>[] = [];
    for (let i = 0; i < 3; i += 1) {
      permitsB.push(
        await serviceB.acquirePermit({ category: 'LIVE_SNAPSHOT', priority: 'HIGH' }),
      );
    }

    await expect(
      serviceB.acquirePermit({
        category: 'LIVE_SNAPSHOT',
        priority: 'HIGH',
        acquireTimeoutMs: 30,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    for (const p of [...permitsA, ...permitsB]) {
      await service.releasePermit(p);
    }
  });

  it('I — Redis unavailable fails closed', async () => {
    redis.eval.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      service.acquirePermit({ category: 'LIVE_SNAPSHOT', priority: 'HIGH' }),
    ).rejects.toMatchObject({ code: 'REDIS_UNAVAILABLE' });
  });

  it('P/Q — active-trip priority beats low-priority cap', async () => {
    const lowPermits = [];
    for (let i = 0; i < 8; i += 1) {
      lowPermits.push(
        await service.acquirePermit({ category: 'HEALTH', priority: 'LOW' }),
      );
    }

    const critical = await service.acquirePermit({
      category: 'ACTIVE_TRIP',
      priority: 'CRITICAL',
    });
    await service.releasePermit(critical);
    for (const p of lowPermits) {
      await service.releasePermit(p);
    }
  });

  it('AK — disabled flag uses budget-disabled token', async () => {
    const disabled = new DimoProviderBudgetService(
      buildConfig({ globalBudgetEnabled: false }),
      redis as any,
      { registry: new Registry() } as any,
    );
    disabled.onModuleInit();
    const permit = await disabled.acquirePermit({
      category: 'LIVE_SNAPSHOT',
      priority: 'HIGH',
    });
    expect(permit.token).toBe('budget-disabled');
  });
});

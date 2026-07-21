import { describe, expect, it, vi } from 'vitest';
import { executeFleetHealthServiceRefresh } from './fleet-health-service-refresh';

describe('executeFleetHealthServiceRefresh', () => {
  it('reloads all sources in parallel and reports full success', async () => {
    const calls: string[] = [];
    const handlers = {
      rentalHealth: vi.fn(async () => {
        calls.push('rentalHealth');
      }),
      fleetRuntime: vi.fn(async () => {
        calls.push('fleetRuntime');
      }),
      taskSummary: vi.fn(async () => {
        calls.push('taskSummary');
      }),
      tasks: vi.fn(async () => {
        calls.push('tasks');
      }),
      vendors: vi.fn(async () => {
        calls.push('vendors');
      }),
      serviceCases: vi.fn(async () => {
        calls.push('serviceCases');
      }),
    };

    const result = await executeFleetHealthServiceRefresh(handlers);

    expect(result.allSucceeded).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.results).toHaveLength(6);
    expect(result.results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        'rentalHealth',
        'fleetRuntime',
        'taskSummary',
        'tasks',
        'vendors',
        'serviceCases',
      ]),
    );
  });

  it('keeps fulfilled source results when other sources fail', async () => {
    const result = await executeFleetHealthServiceRefresh({
      rentalHealth: vi.fn(async () => undefined),
      fleetRuntime: vi.fn(async () => undefined),
      taskSummary: vi.fn(async () => {
        throw new Error('summary failed');
      }),
      tasks: vi.fn(async () => undefined),
      vendors: vi.fn(async () => {
        throw new Error('vendors failed');
      }),
      serviceCases: vi.fn(async () => undefined),
    });

    expect(result.allSucceeded).toBe(false);
    expect(result.partial).toBe(true);

    const bySource = Object.fromEntries(result.results.map((entry) => [entry.source, entry]));
    expect(bySource.taskSummary?.status).toBe('rejected');
    expect(bySource.taskSummary?.error).toBe('summary failed');
    expect(bySource.vendors?.status).toBe('rejected');
    expect(bySource.tasks?.status).toBe('fulfilled');
    expect(bySource.rentalHealth?.status).toBe('fulfilled');
  });
});

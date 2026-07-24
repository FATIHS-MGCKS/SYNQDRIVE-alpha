import { describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '../../lib/api';
import { VehicleTelemetryRequestCoordinator } from './vehicle-telemetry-request-coordinator';
import { VEHICLE_TELEMETRY_RETRY } from './vehicle-telemetry-retry';

describe('VehicleTelemetryRequestCoordinator', () => {
  it('binds generation and rejects stale responses after vehicle change', async () => {
    const coordinator = new VehicleTelemetryRequestCoordinator();
    const first = coordinator.bind('org-1', 'veh-1');

    let resolveFirst!: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });

    const firstRun = coordinator.run({
      channel: 'dashboard',
      binding: first,
      normalIntervalMs: 30_000,
      timeoutMs: 25_000,
      execute: () => slow,
    });

    coordinator.bind('org-1', 'veh-2');
    resolveFirst('stale');
    const result = await firstRun;

    expect(result.stale).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('prevents overlapping in-flight requests on the same channel', async () => {
    const coordinator = new VehicleTelemetryRequestCoordinator();
    const binding = coordinator.bind('org-1', 'veh-1');

    let resolveSlow!: () => void;
    const slow = new Promise<string>((resolve) => {
      resolveSlow = () => resolve('ok');
    });

    const execute = vi.fn(() => slow);

    const first = coordinator.run({
      channel: 'gps',
      binding,
      normalIntervalMs: 5_000,
      timeoutMs: 20_000,
      execute,
    });
    const second = coordinator.run({
      channel: 'gps',
      binding,
      normalIntervalMs: 5_000,
      timeoutMs: 20_000,
      execute,
    });

    const secondResult = await second;
    expect(secondResult.ok).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);

    resolveSlow();
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
  });

  it('aborts in-flight work when channel is aborted', async () => {
    const coordinator = new VehicleTelemetryRequestCoordinator();
    const binding = coordinator.bind('org-1', 'veh-1');

    let capturedSignal: AbortSignal | null = null;
    const runPromise = coordinator.run({
      channel: 'gps',
      binding,
      normalIntervalMs: 5_000,
      timeoutMs: 20_000,
      execute: (signal) =>
        new Promise<string>((_resolve, reject) => {
          capturedSignal = signal;
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    });

    await Promise.resolve();
    coordinator.abortChannel('gps');
    const result = await runPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(result.aborted).toBe(true);
  });

  it('does not retry 403 and surfaces policy', async () => {
    const coordinator = new VehicleTelemetryRequestCoordinator();
    const binding = coordinator.bind('org-1', 'veh-1');

    const result = await coordinator.run({
      channel: 'dashboard',
      binding,
      normalIntervalMs: 30_000,
      timeoutMs: 25_000,
      execute: async () => {
        throw new ApiHttpError('Missing permission: fleet.read', 403);
      },
    });

    expect(result.ok).toBe(false);
    expect(result.policy?.kind).toBe('permission');
    expect(result.policy?.retryable).toBe(false);
    expect(result.nextDelayMs).toBe(30_000);
  });

  it('backs off on retryable 500 errors', async () => {
    const coordinator = new VehicleTelemetryRequestCoordinator();
    const binding = coordinator.bind('org-1', 'veh-1');

    const result = await coordinator.run({
      channel: 'dashboard',
      binding,
      normalIntervalMs: 30_000,
      timeoutMs: 25_000,
      execute: async () => {
        throw new ApiHttpError('Server error', 500);
      },
    });

    expect(result.ok).toBe(false);
    expect(result.policy?.retryable).toBe(true);
    expect(result.nextDelayMs).toBeGreaterThan(0);
    expect(result.nextDelayMs).toBeLessThanOrEqual(VEHICLE_TELEMETRY_RETRY.MAX_BACKOFF_MS);
  });

});

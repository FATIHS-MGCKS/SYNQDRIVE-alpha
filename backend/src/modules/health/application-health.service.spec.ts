import { ApplicationHealthService } from './application-health.service';
import { DependencyProbeResult } from './dependency-health.types';
import { DEFAULT_PROBE_TIMEOUT_MS, withProbeTimeout } from './health-probe.util';

describe('health-probe.util', () => {
  it('resolves before timeout', async () => {
    const value = await withProbeTimeout('fast', async () => 'ok', 500);
    expect(value).toBe('ok');
  });

  it('rejects when probe exceeds timeout', async () => {
    await expect(
      withProbeTimeout(
        'slow',
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
        5,
      ),
    ).rejects.toThrow(/slow probe timed out/);
  });
});

describe('ApplicationHealthService.dependencyUpValue', () => {
  const service = Object.create(ApplicationHealthService.prototype) as ApplicationHealthService;

  const probe = (
    status: DependencyProbeResult['status'],
    key: DependencyProbeResult['key'] = 'postgres',
  ): DependencyProbeResult => ({
    key,
    status,
    required: true,
    responseMs: 1,
  });

  it('maps ok to 1', () => {
    expect(service.dependencyUpValue(probe('ok'))).toBe(1);
  });

  it('maps error and degraded to 0', () => {
    expect(service.dependencyUpValue(probe('error'))).toBe(0);
    expect(service.dependencyUpValue(probe('degraded'))).toBe(0);
  });

  it('skips optional integrations', () => {
    expect(service.dependencyUpValue(probe('skipped', 'stripe'))).toBeNull();
  });
});

describe('DEFAULT_PROBE_TIMEOUT_MS', () => {
  it('is bounded for fast health endpoints', () => {
    expect(DEFAULT_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isCoordinatedRefreshActive,
  resetCoordinatedRefreshCoordinator,
  runCoordinatedRefresh,
} from './fleet-health-service-refresh-coordinator';

describe('fleet-health-service-refresh-coordinator', () => {
  it('tracks coordinated refresh depth', async () => {
    resetCoordinatedRefreshCoordinator();
    expect(isCoordinatedRefreshActive()).toBe(false);

    const pending = runCoordinatedRefresh(async () => {
      expect(isCoordinatedRefreshActive()).toBe(true);
      return 'ok';
    });

    expect(isCoordinatedRefreshActive()).toBe(true);
    await expect(pending).resolves.toBe('ok');
    expect(isCoordinatedRefreshActive()).toBe(false);
  });
});

import type { DiV0S4DiscoveryService } from '../di-v0-s4b-discovery.service';
import { DiV0S4DiscoveryScheduler } from '../di-v0-s4b-discovery.scheduler';

describe('DI V0 S4B discovery scheduler (S4B-D04)', () => {
  it('S4B-D04 non-leader: shouldRun false -> no discovery pass', async () => {
    const runDiscoveryPass = jest.fn();
    const discovery = {
      isConfigured: () => true,
      runDiscoveryPass,
    } as unknown as DiV0S4DiscoveryService;
    const leaderGuard = { shouldRun: jest.fn(() => false) };
    const scheduler = new DiV0S4DiscoveryScheduler(discovery, leaderGuard as never);
    await expect(scheduler.tick()).resolves.toBeNull();
    expect(leaderGuard.shouldRun).toHaveBeenCalledWith('di_v0_s4_discovery');
    expect(runDiscoveryPass).not.toHaveBeenCalled();
  });
});

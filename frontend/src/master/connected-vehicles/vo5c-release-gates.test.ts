import { describe, expect, it, vi, afterEach } from 'vitest';
import { isMasterOffboardUiEnabled } from './vo5c-release-gates';

describe('isMasterOffboardUiEnabled (fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('B — absent flag is OFF', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', '');
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('invalid flag is OFF', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'maybe');
    expect(isMasterOffboardUiEnabled()).toBe(false);
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'off');
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('explicit on enables', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'on');
    expect(isMasterOffboardUiEnabled()).toBe(true);
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'true');
    expect(isMasterOffboardUiEnabled()).toBe(true);
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', '1');
    expect(isMasterOffboardUiEnabled()).toBe(true);
  });
});

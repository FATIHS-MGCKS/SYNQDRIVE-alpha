import { describe, expect, it } from 'vitest';
import { isStationTeamTabWired, buildStationDetailTabDescriptors } from './station-detail-tabs';

describe('station team and activity tab visibility', () => {
  it('hides team tab when membership wiring is not active', () => {
    expect(isStationTeamTabWired(null)).toBe(false);
    expect(isStationTeamTabWired({ wired: false } as never)).toBe(false);
    const tabs = buildStationDetailTabDescriptors({ canViewActivity: true }, { wired: false, staff: [] } as never);
    expect(tabs.map((tab) => tab.key)).not.toContain('team');
    expect(tabs.map((tab) => tab.key)).toContain('activity');
  });

  it('shows team tab when membership wiring is active', () => {
    expect(isStationTeamTabWired({ wired: true, staff: [] } as never)).toBe(true);
    const tabs = buildStationDetailTabDescriptors(
      { canViewActivity: false },
      { wired: true, staff: [{ membershipId: 'm1' }] } as never,
    );
    expect(tabs.map((tab) => tab.key)).toContain('team');
    expect(tabs.map((tab) => tab.key)).not.toContain('activity');
  });
});

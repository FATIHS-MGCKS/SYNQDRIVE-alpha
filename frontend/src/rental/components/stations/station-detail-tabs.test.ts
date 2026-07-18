import { describe, expect, it } from 'vitest';
import {
  buildStationDetailTabDescriptors,
  isStationTeamTabWired,
  tabRequiresDataLoad,
} from './station-detail-tabs';

describe('station-detail-tabs', () => {
  it('exposes only core tabs when optional surfaces are not wired', () => {
    const tabs = buildStationDetailTabDescriptors({ canViewActivity: false }, { staff: [] });
    expect(tabs.map((tab) => tab.key)).toEqual(['overview', 'fleet', 'schedule', 'operations']);
  });

  it('adds activity when permission is granted', () => {
    const tabs = buildStationDetailTabDescriptors({ canViewActivity: true }, null);
    expect(tabs.map((tab) => tab.key)).toContain('activity');
    expect(tabs.map((tab) => tab.key)).not.toContain('team');
  });

  it('adds team only when membership wiring is active', () => {
    expect(isStationTeamTabWired({ wired: false, staff: [] } as never)).toBe(false);
    expect(
      isStationTeamTabWired({
        wired: true,
        staff: [{ membershipId: 'm1', userId: 'u1', displayName: 'Alex', role: 'WORKER', roleLabel: null, scopeMode: 'THIS_STATION', scopeLabel: 'This station', assignedStationCount: 1 }],
      } as never),
    ).toBe(true);
  });

  it('maps tabs to lazy-loaded data keys', () => {
    expect(tabRequiresDataLoad('overview')).toBeNull();
    expect(tabRequiresDataLoad('fleet')).toBeNull();
    expect(tabRequiresDataLoad('schedule')).toBe('schedule');
    expect(tabRequiresDataLoad('operations')).toBe('operations');
  });
});

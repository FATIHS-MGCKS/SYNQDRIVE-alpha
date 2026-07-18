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

  it('adds team only when staff assignments exist', () => {
    expect(isStationTeamTabWired({ staff: [], managerName: 'A', contactPerson: null, phone: null, email: null })).toBe(false);
    expect(
      isStationTeamTabWired({
        staff: [{ id: 'u1', name: 'Alex', role: 'Manager' }],
        managerName: 'Alex',
        contactPerson: null,
        phone: null,
        email: null,
      }),
    ).toBe(true);
  });

  it('maps tabs to lazy-loaded data keys', () => {
    expect(tabRequiresDataLoad('overview')).toBeNull();
    expect(tabRequiresDataLoad('fleet')).toBeNull();
    expect(tabRequiresDataLoad('schedule')).toBe('schedule');
    expect(tabRequiresDataLoad('operations')).toBe('operations');
  });
});

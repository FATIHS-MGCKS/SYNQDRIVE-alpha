import { describe, expect, it, vi } from 'vitest';
import { MASTER_NAV_ITEM_BY_ID } from '../navigation/master-nav.config';
import { getVisibleMasterNavItemIds } from '../navigation/master-nav-permissions';

vi.mock('../../lib/auth', () => ({
  getStoredUser: () => ({ platformRole: 'MASTER_ADMIN' }),
  isMasterAdmin: () => true,
  hasMasterBillingAccess: () => false,
}));

describe('Master nav — Battery V2 shadow inspection (C5B)', () => {
  it('registers engineering nav entry for MASTER_ADMIN only', () => {
    const item = MASTER_NAV_ITEM_BY_ID['battery-v2-shadow-inspection'];
    expect(item).toBeDefined();
    expect(item.permissions).toEqual(['MASTER_ADMIN']);
  });

  it('includes view in visible master nav set', () => {
    expect(getVisibleMasterNavItemIds()).toContain('battery-v2-shadow-inspection');
  });
});

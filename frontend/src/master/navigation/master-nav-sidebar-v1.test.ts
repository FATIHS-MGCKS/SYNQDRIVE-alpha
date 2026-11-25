import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MASTER_NAV_GROUPS,
  MASTER_NAV_ITEMS,
  getMasterSidebarMainNavViews,
  collectViewsFromGroup,
} from './master-nav.config';
import {
  getVisibleMasterNavItemIds,
  isBillingOnlyMasterUser,
  canAccessMasterNavItem,
  isMasterNavItemVisible,
} from './master-nav-permissions';
import { getMasterSidebarFooterViews } from './master-nav.config';
import { normalizeMasterNavLocation } from './master-nav-url';
import { MASTER_NAV_ITEM_BY_ID } from './master-nav.config';
import * as auth from '../../lib/auth';

vi.mock('../../lib/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...mod,
    getStoredUser: vi.fn(),
    isMasterAdmin: vi.fn(() => true),
    hasMasterBillingAccess: vi.fn(() => false),
  };
});

const sidebarSource = readFileSync(resolve(__dirname, '../components/Sidebar.tsx'), 'utf8');

describe('Master Admin Sidebar V1', () => {
  it('keeps exactly 23 registered nav items', () => {
    expect(MASTER_NAV_ITEMS).toHaveLength(23);
  });

  it('counts each registered view exactly once across main rail and footer', () => {
    const counts = new Map<string, number>();
    const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const id of getMasterSidebarMainNavViews()) bump(id);
    for (const id of getMasterSidebarFooterViews()) bump(id);
    for (const item of MASTER_NAV_ITEMS) {
      expect(counts.get(item.id), item.id).toBe(1);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(23);
  });

  it('places each registered view exactly once in main nav or footer', () => {
    const main = new Set(getMasterSidebarMainNavViews());
    expect(main.has('support')).toBe(false);
    expect(main.size).toBe(22);
    const allIds = new Set(MASTER_NAV_ITEMS.map((i) => i.id));
    expect(allIds.size).toBe(23);
    for (const id of allIds) {
      if (id === 'support') continue;
      expect(main.has(id)).toBe(true);
    }
    expect(allIds.has('support')).toBe(true);
  });

  it('matches owner group structure', () => {
    expect(MASTER_NAV_GROUPS.map((g) => g.id)).toEqual([
      'verwaltung',
      'produkte-business',
      'plattform',
      'intelligence',
      'engineering',
    ]);
    expect(MASTER_NAV_GROUPS.find((g) => g.id === 'verwaltung')?.defaultExpanded).toBe(true);
    expect(MASTER_NAV_GROUPS.filter((g) => g.id !== 'verwaltung').every((g) => !g.defaultExpanded)).toBe(true);

    const plattform = MASTER_NAV_GROUPS.find((g) => g.id === 'plattform');
    const integrations = plattform?.entries.find((e) => e.type === 'parent' && e.view === 'platform-integrations');
    expect(integrations).toMatchObject({
      children: ['high-mobility', 'service-client-management', 'voice-assistant'],
    });

    const produkte = MASTER_NAV_GROUPS.find((g) => g.id === 'produkte-business');
    const partners = produkte?.entries.find((e) => e.type === 'folder');
    expect(partners).toMatchObject({ children: ['parts-accessories', 'insurances'] });
  });

  it('isolates billing-only users to dashboard and billing', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      id: 'u1',
      email: 'b@test.io',
      name: 'Billing',
      platformRole: 'master-billing',
    } as never);
    vi.mocked(auth.isMasterAdmin).mockReturnValue(false);
    vi.mocked(auth.hasMasterBillingAccess).mockReturnValue(true);
    expect(isBillingOnlyMasterUser()).toBe(true);
    expect(getVisibleMasterNavItemIds()).toEqual(['dashboard', 'billing']);
    expect(canAccessMasterNavItem(MASTER_NAV_ITEM_BY_ID['vsi-intelligence']!)).toBe(false);
    expect(isMasterNavItemVisible('dashboard')).toBe(true);
    expect(isMasterNavItemVisible('billing')).toBe(true);
    expect(isMasterNavItemVisible('organizations')).toBe(false);
    expect(canAccessMasterNavItem(MASTER_NAV_ITEM_BY_ID.dashboard!)).toBe(false);
  });

  it('does not duplicate support in main nav or render integrations in footer', () => {
    const supportInMain = getMasterSidebarMainNavViews().filter((v) => v === 'support');
    expect(supportInMain).toHaveLength(0);
    expect(sidebarSource).not.toMatch(/sq-sidebar-footer[\s\S]*master\.nav\.platformIntegrations/);
    const footerBlock = sidebarSource.split('sq-sidebar-footer')[1] ?? '';
    expect(footerBlock).not.toMatch(/go\('platform-integrations'\)/);
    expect(sidebarSource).toMatch(/go\('support'\)/);
  });

  it('does not render mobile primary shortcut rail', () => {
    expect(sidebarSource).not.toContain('MASTER_MOBILE_PRIMARY_VIEWS');
    expect(sidebarSource).not.toContain('primarySection');
  });

  it('normalizes legacy Master URL aliases', () => {
    expect(normalizeMasterNavLocation('?view=hm-compatibility').view).toBe('high-mobility');
    expect(normalizeMasterNavLocation('?view=platform-health').view).toBe('platform-ops');
    expect(normalizeMasterNavLocation('?view=users').view).toBe('security-access');
    expect(normalizeMasterNavLocation('?view=vehicle-logbook').view).toBe('vehicles');
  });

  it('includes engineering hub views in engineering group', () => {
    const views = collectViewsFromGroup(MASTER_NAV_GROUPS.find((g) => g.id === 'engineering')!);
    expect(views).toEqual([
      'tire-v3-calibration-center',
      'battery-v2-shadow-inspection',
      'battery-v2-hv-inspection',
      'architektur',
      'changes',
    ]);
  });
});
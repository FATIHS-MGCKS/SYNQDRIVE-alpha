import { describe, expect, it } from 'vitest';
import { MASTER_NAV_GROUPS, MASTER_NAV_ITEMS } from './master-nav.config';
import { normalizeMasterNavLocation, buildMasterNavSearch } from './master-nav-url';
import { VISIBLE_PRODUCT_ROADMAP_SLUGS } from '../components/organization-products/ProductRoadmapOverview';
import { tMasterNav } from './master-nav-i18n';

describe('master-nav product-management', () => {
  it('registers sidebar item in commerce group with German label', () => {
    const item = MASTER_NAV_ITEMS.find((i) => i.id === 'product-management');
    expect(item).toBeTruthy();
    expect(item?.permissions).toEqual(['MASTER_ADMIN']);
    expect(item?.permissions).not.toContain('master-billing');
    expect(tMasterNav('master.nav.productManagement')).toBe('Produktmanagement');
    const commerce = MASTER_NAV_GROUPS.find((g) => g.id === 'commerce');
    expect(commerce?.items).toContain('product-management');
  });

  it('normalizes direct URL view=product-management', () => {
    const loc = normalizeMasterNavLocation('?view=product-management');
    expect(loc.view).toBe('product-management');
    const qs = buildMasterNavSearch({ view: 'product-management' }, false);
    expect(qs).toContain('view=product-management');
  });

  it('roadmap overview excludes TAXI slug', () => {
    expect(VISIBLE_PRODUCT_ROADMAP_SLUGS).toEqual(['RENTAL', 'FLEET', 'VYMOD']);
    expect(VISIBLE_PRODUCT_ROADMAP_SLUGS).not.toContain('TAXI');
  });
});
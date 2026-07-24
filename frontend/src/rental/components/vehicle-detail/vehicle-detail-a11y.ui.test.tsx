import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { VehicleDetailTabBar } from './VehicleDetailTabBar';
import { VehicleDetailTabPanel } from './VehicleDetailTabPanel';
import {
  VEHICLE_DETAIL_TAB_ID,
  VEHICLE_DETAIL_TAB_PANEL_ID,
} from '../../lib/vehicle-detail-a11y';

describe('Vehicle detail a11y UI', () => {
  it('renders tablist with aria-controls and roving tabindex', () => {
    const html = renderToStaticMarkup(
      <VehicleDetailTabBar activeTab="overview" onTabChange={() => {}} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain(`id="${VEHICLE_DETAIL_TAB_ID.overview}"`);
    expect(html).toContain(`aria-controls="${VEHICLE_DETAIL_TAB_PANEL_ID.overview}"`);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('renders tabpanel with aria-labelledby', () => {
    const html = renderToStaticMarkup(
      <VehicleDetailTabPanel tab="overview" activeTab="overview">
        <p>Overview content</p>
      </VehicleDetailTabPanel>,
    );
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain(`id="${VEHICLE_DETAIL_TAB_PANEL_ID.overview}"`);
    expect(html).toContain(`aria-labelledby="${VEHICLE_DETAIL_TAB_ID.overview}"`);
  });
});

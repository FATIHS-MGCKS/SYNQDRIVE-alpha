import { describe, expect, it, vi } from 'vitest';

import { VEHICLE_DETAIL_TAB_ID } from './vehicle-detail-a11y';
import { scrollActiveVehicleDetailTabIntoView } from './vehicle-detail-tab-scroll';

describe('scrollActiveVehicleDetailTabIntoView', () => {
  it('scrolls active tab with horizontal center alignment', () => {
    const scrollIntoView = vi.fn();
    const el = { scrollIntoView } as unknown as HTMLElement;

    scrollActiveVehicleDetailTabIntoView('vehicle-requirements', (id) =>
      id === VEHICLE_DETAIL_TAB_ID['vehicle-requirements'] ? el : null,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest' }),
    );
  });

  it('no-ops when tab element is missing', () => {
    expect(() =>
      scrollActiveVehicleDetailTabIntoView('overview', () => null),
    ).not.toThrow();
  });
});
import { describe, expect, it } from 'vitest';
import {
  VEHICLE_DETAIL_BACK_BUTTON_CLASS,
  VEHICLE_DETAIL_SCROLL_ROW_CLASS,
  VEHICLE_DETAIL_TAB_TRIGGER_CLASS,
  VEHICLE_DETAIL_VIEW_CLASS,
} from './vehicle-detail-mobile-ui';

describe('vehicle-detail-mobile-ui tokens', () => {
  it('contains overflow containment and safe-area padding on the view shell', () => {
    expect(VEHICLE_DETAIL_VIEW_CLASS).toContain('overflow-x-clip');
    expect(VEHICLE_DETAIL_VIEW_CLASS).toContain('safe-area-inset-bottom');
  });

  it('uses touch-friendly horizontal scroll for filter rows', () => {
    expect(VEHICLE_DETAIL_SCROLL_ROW_CLASS).toContain('overflow-x-auto');
    expect(VEHICLE_DETAIL_SCROLL_ROW_CLASS).toContain('overscroll-x-contain');
  });

  it('enforces 44px touch minimums on mobile-only controls', () => {
    expect(VEHICLE_DETAIL_TAB_TRIGGER_CLASS).toContain('min-h-[44px]');
    expect(VEHICLE_DETAIL_BACK_BUTTON_CLASS).toContain('min-h-[44px]');
    expect(VEHICLE_DETAIL_BACK_BUTTON_CLASS).toContain('min-w-[44px]');
  });
});

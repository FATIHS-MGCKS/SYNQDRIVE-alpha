/**
 * Mobile layout tokens for the Vehicle Detail Page.
 * No visual redesign — overflow containment, safe areas, and touch minimums only.
 */

/** Root shell when vehicle-detail chrome is visible. */
export const VEHICLE_DETAIL_VIEW_CLASS =
  'min-w-0 max-w-full overflow-x-clip pb-[max(0.5rem,env(safe-area-inset-bottom))]';

/** Horizontally scrollable filter/tool rows on narrow viewports (e.g. Trips filters). */
export const VEHICLE_DETAIL_SCROLL_ROW_CLASS =
  'flex min-w-0 max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-thin [-webkit-overflow-scrolling:touch]';

/** Tab triggers — 44px minimum touch height without changing desktop density. */
export const VEHICLE_DETAIL_TAB_TRIGGER_CLASS = 'min-h-[44px] py-2 sm:min-h-0 sm:py-1.5';

/** Header back control — 44×44px touch target. */
export const VEHICLE_DETAIL_BACK_BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center sm:min-h-0 sm:min-w-0 sm:p-1.5';

/** Status / cleaning chip triggers — adequate touch height on mobile. */
export const VEHICLE_DETAIL_CHIP_TRIGGER_CLASS = 'inline-flex min-h-11 items-center sm:min-h-0';

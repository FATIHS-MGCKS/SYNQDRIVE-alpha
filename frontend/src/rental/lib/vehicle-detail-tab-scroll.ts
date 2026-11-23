import { VEHICLE_DETAIL_TAB_ID } from './vehicle-detail-a11y';
import type { VehicleDetailTab } from './vehicle-overview.types';

/** Keep selected vehicle detail tab visible inside horizontal tab scroller (narrow viewports). */
export function scrollActiveVehicleDetailTabIntoView(
  activeTab: VehicleDetailTab,
  resolveElement: (id: string) => HTMLElement | null = (id) =>
    typeof document !== 'undefined' ? document.getElementById(id) : null,
): void {
  const node = resolveElement(VEHICLE_DETAIL_TAB_ID[activeTab]);
  if (!node || typeof node.scrollIntoView !== 'function') return;

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    node.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  } catch {
    node.scrollIntoView();
  }
}
import type { VehicleOverviewQuickCardId } from './vehicle-overview.types';
import type { VehicleDetailTab } from './vehicle-overview.types';

/** Navigation target for overview quick cards and readiness strip actions. */
export type VehicleOverviewNavigateTarget =
  | { tab: Extract<VehicleDetailTab, 'trips'> }
  | { tab: Extract<VehicleDetailTab, 'health-errors'> }
  | { tab: Extract<VehicleDetailTab, 'damages'> }
  | { tab: Extract<VehicleDetailTab, 'documents'> }
  | { tab: Extract<VehicleDetailTab, 'vehicle-bookings'>; bookingId?: string }
  | { tab: Extract<VehicleDetailTab, 'vehicle-tasks'>; taskId?: string }
  | { tab: Extract<VehicleDetailTab, 'vehicle-requirements'> };

export type NavigateVehicleOverviewTarget = (target: VehicleOverviewNavigateTarget) => void;

/** Keep in sync with `VEHICLE_DETAIL_VIEWS` in `rental/App.tsx`. */
export const VEHICLE_DETAIL_TAB_KEYS = [
  'overview',
  'trips',
  'health-errors',
  'damages',
  'documents',
  'vehicle-bookings',
  'vehicle-tasks',
  'vehicle-requirements',
] as const;

/** Quick-card id → existing vehicle detail tab key (no invented keys). */
export const OVERVIEW_QUICK_CARD_TABS: Record<
  VehicleOverviewQuickCardId,
  VehicleOverviewNavigateTarget['tab']
> = {
  trips: 'trips',
  bookings: 'vehicle-bookings',
  tasks: 'vehicle-tasks',
  damages: 'damages',
  documents: 'documents',
};

export function navigateOverviewQuickCardTab(
  onNavigate: NavigateVehicleOverviewTarget,
  cardId: keyof typeof OVERVIEW_QUICK_CARD_TABS,
): void {
  onNavigate({ tab: OVERVIEW_QUICK_CARD_TABS[cardId] });
}

const VEHICLE_DETAIL_TABS: ReadonlySet<string> = new Set(VEHICLE_DETAIL_TAB_KEYS);

export function isVehicleDetailTab(view: string): view is VehicleDetailTab {
  return VEHICLE_DETAIL_TABS.has(view);
}

export function vehicleOverviewTargetTab(
  target: VehicleOverviewNavigateTarget,
): VehicleDetailTab {
  return target.tab;
}

/**
 * Maps overview quick-card ids to their default detail tab.
 * Location and health keep their existing dedicated surfaces on Overview.
 */
export function defaultTabForOverviewQuickCard(
  cardId: 'location' | 'health' | 'next-event' | 'tasks' | 'damages' | 'documents' | 'trips',
): VehicleDetailTab {
  switch (cardId) {
    case 'location':
      return 'overview';
    case 'health':
      return 'health-errors';
    case 'next-event':
      return 'vehicle-bookings';
    case 'tasks':
      return 'vehicle-tasks';
    case 'damages':
      return 'damages';
    case 'documents':
      return 'documents';
    case 'trips':
      return 'trips';
    default:
      return 'overview';
  }
}

export interface CreateVehicleOverviewNavigatorOptions {
  setCurrentView: (view: VehicleDetailTab) => void;
  setHighlightedVehicleTaskId?: (taskId: string | null) => void;
  /** Opens global bookings detail when leaving vehicle context is required. */
  setPendingBookingDetailId?: (bookingId: string | null) => void;
  openGlobalBookingDetail?: (bookingId: string) => void;
}

/**
 * Small adapter so overview components do not call `setCurrentView` ad hoc.
 * Wire this once in `App.tsx` when the overview quick row ships.
 */
export function createVehicleOverviewNavigator(
  options: CreateVehicleOverviewNavigatorOptions,
): NavigateVehicleOverviewTarget {
  const {
    setCurrentView,
    setHighlightedVehicleTaskId,
    setPendingBookingDetailId,
    openGlobalBookingDetail,
  } = options;

  return (target) => {
    setCurrentView(target.tab);

    if (target.tab === 'vehicle-tasks' && target.taskId) {
      setHighlightedVehicleTaskId?.(target.taskId);
    } else {
      setHighlightedVehicleTaskId?.(null);
    }

    if (target.tab === 'vehicle-bookings' && target.bookingId) {
      setPendingBookingDetailId?.(target.bookingId);
    }
  };
}

/** Optional escape hatch: jump to global booking detail from vehicle overview. */
export function navigateToGlobalBooking(
  bookingId: string,
  openGlobalBookingDetail?: (bookingId: string) => void,
): void {
  openGlobalBookingDetail?.(bookingId);
}

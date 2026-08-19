import type { TranslationKey } from '../../../i18n/translations/en';
import { dt } from './dashboard-i18n';
import type { DashboardViewProps } from './dashboardTypes';
import type { DashboardViewModel } from './dashboardTypes';
import type { DashboardDrilldownCta, DashboardDrilldownRow } from './dashboardDrilldownTypes';

export interface DashboardDrilldownHandlers {
  vm: DashboardViewModel;
  onOpenVehicleById?: DashboardViewProps['onOpenVehicleById'];
  onOpenBookingById?: DashboardViewProps['onOpenBookingById'];
  onOpenRentalView?: DashboardViewProps['onOpenRentalView'];
  onOpenFinanceView?: DashboardViewProps['onOpenFinanceView'];
  onClose?: () => void;
}

const DRILLDOWN_CTA_KEYS: Record<DashboardDrilldownCta, TranslationKey> = {
  'open-vehicle': 'notification.cta.openVehicle',
  'open-booking': 'notification.cta.openBooking',
  'start-handover-pickup': 'notification.cta.startPickup',
  'start-handover-return': 'notification.cta.startReturn',
  'open-invoice': 'notification.cta.openInvoice',
  'open-finance': 'notification.cta.openFinance',
  'open-stations': 'notification.cta.openStation',
  'open-rental': 'notification.cta.openRental',
};

export function drilldownCtaLabel(cta: DashboardDrilldownCta, locale: string): string {
  return dt(locale, DRILLDOWN_CTA_KEYS[cta] ?? 'notification.cta.openRental');
}

export function runDrilldownCta(row: DashboardDrilldownRow, handlers: DashboardDrilldownHandlers): void {
  const { vm, onOpenVehicleById, onOpenBookingById, onOpenRentalView, onOpenFinanceView, onClose } =
    handlers;

  switch (row.cta) {
    case 'start-handover-pickup':
      if (row.pickupItem) vm.handleConfirmPickup(row.pickupItem);
      else if (row.actionItem?.pickupItem) vm.handleConfirmPickup(row.actionItem.pickupItem);
      onClose?.();
      break;
    case 'start-handover-return':
      if (row.returnItem) vm.handleConfirmReturn(row.returnItem);
      else if (row.actionItem?.returnItem) vm.handleConfirmReturn(row.actionItem.returnItem);
      onClose?.();
      break;
    case 'open-vehicle':
      if (row.vehicleId && onOpenVehicleById) {
        onOpenVehicleById(row.vehicleId);
        onClose?.();
      }
      break;
    case 'open-booking':
      if (row.bookingId && onOpenBookingById) {
        onOpenBookingById(row.bookingId);
        onClose?.();
      } else if (onOpenRentalView) {
        onOpenRentalView('bookings');
        onClose?.();
      }
      break;
    case 'open-invoice':
      onOpenFinanceView?.('invoices');
      onClose?.();
      break;
    case 'open-finance':
      onOpenFinanceView?.('financial-insights');
      onClose?.();
      break;
    case 'open-stations':
      onOpenRentalView?.('stations');
      onClose?.();
      break;
    case 'open-rental':
    default:
      onOpenRentalView?.('bookings');
      onClose?.();
      break;
  }
}

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

export function drilldownCtaLabel(cta: DashboardDrilldownCta, de: boolean): string {
  if (cta === 'open-vehicle') return de ? 'Fahrzeug öffnen' : 'Open vehicle';
  if (cta === 'open-booking') return de ? 'Buchung öffnen' : 'Open booking';
  if (cta === 'start-handover-pickup' || cta === 'start-handover-return') {
    return de ? 'Übergabe starten' : 'Start handover';
  }
  if (cta === 'open-invoice') return de ? 'Rechnung öffnen' : 'Open invoice';
  if (cta === 'open-finance') return de ? 'Finanzen öffnen' : 'Open finance';
  if (cta === 'open-stations') return de ? 'Stationen öffnen' : 'Open stations';
  return de ? 'Vermietung öffnen' : 'Open rental';
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

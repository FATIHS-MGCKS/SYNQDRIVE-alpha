import { useRentalOrg } from '../RentalContext';
import { useDocumentVisible, useNetworkOnline } from './useBrowserTabSignals';
import { useVehicleDetailPollingStore } from '../stores/useVehicleDetailPollingStore';

/** True when Overview-tab surface polling (map, device connection, battery live) may run. */
export function useVehicleDetailOverviewPollingEnabled(
  vehicleId: string | null | undefined,
): boolean {
  const { hasPermission } = useRentalOrg();
  const isDocumentVisible = useDocumentVisible();
  const isOnline = useNetworkOnline();
  const mapVisible = useVehicleDetailPollingStore((s) => s.overviewMapVisible);
  const accessBlock = useVehicleDetailPollingStore((s) => s.telemetryAccessBlock);

  return Boolean(
    vehicleId &&
      isDocumentVisible &&
      isOnline &&
      hasPermission('fleet', 'read') &&
      !accessBlock &&
      mapVisible,
  );
}

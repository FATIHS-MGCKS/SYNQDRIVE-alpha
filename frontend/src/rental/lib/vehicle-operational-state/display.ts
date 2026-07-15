import {
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleOperationalStatus,
  type VehicleOperationalTabStatus,
} from './types';
import {
  normalizeVehicleOperationalStatusKey,
  type NormalizeVehicleOperationalStatusInput,
} from './normalize';

export type VehicleOperationalDisplayLocale = 'de' | 'en';

const LABELS_DE: Record<VehicleOperationalStatus, string> = {
  [VEHICLE_OPERATIONAL_STATUS.AVAILABLE]: 'Verfügbar',
  [VEHICLE_OPERATIONAL_STATUS.RESERVED]: 'Reserviert',
  [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED]: 'Aktiv vermietet',
  [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE]: 'Wartung',
  [VEHICLE_OPERATIONAL_STATUS.BLOCKED]: 'Blockiert',
  [VEHICLE_OPERATIONAL_STATUS.UNKNOWN]: 'Unbekannt',
};

const LABELS_EN: Record<VehicleOperationalStatus, string> = {
  [VEHICLE_OPERATIONAL_STATUS.AVAILABLE]: 'Available',
  [VEHICLE_OPERATIONAL_STATUS.RESERVED]: 'Reserved',
  [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED]: 'Active Rented',
  [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE]: 'Maintenance',
  [VEHICLE_OPERATIONAL_STATUS.BLOCKED]: 'Blocked',
  [VEHICLE_OPERATIONAL_STATUS.UNKNOWN]: 'Unknown',
};

/** Central display utility — German labels by default for rental surfaces. */
export function formatVehicleOperationalStatusLabel(
  status: VehicleOperationalStatus,
  locale: VehicleOperationalDisplayLocale = 'de',
): string {
  const table = locale === 'de' ? LABELS_DE : LABELS_EN;
  return table[status] ?? table[VEHICLE_OPERATIONAL_STATUS.UNKNOWN];
}

export function formatVehicleOperationalStatusLabelFromRaw(
  raw: string | null | undefined,
  options: Omit<NormalizeVehicleOperationalStatusInput, 'status'> = {},
  locale: VehicleOperationalDisplayLocale = 'de',
): string {
  const status = normalizeVehicleOperationalStatusKey(raw, options);
  return formatVehicleOperationalStatusLabel(status, locale);
}

/** i18n key suffix for dashboard.* translations (tab labels). */
export const VEHICLE_OPERATIONAL_TAB_LABEL_KEY: Record<VehicleOperationalTabStatus, string> = {
  [VEHICLE_OPERATIONAL_STATUS.AVAILABLE]: 'availableTab',
  [VEHICLE_OPERATIONAL_STATUS.RESERVED]: 'reservedTab',
  [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED]: 'activeRentedTab',
  [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE]: 'maintenanceTab',
};

/**
 * Match a vehicle's operational status to a dashboard tab.
 * UNKNOWN never matches AVAILABLE (or any tab).
 */
export function vehicleOperationalStatusMatchesTab(
  vehicleStatus: string | null | undefined,
  tab: VehicleOperationalTabStatus,
): boolean {
  const normalized = normalizeVehicleOperationalStatusKey(vehicleStatus);
  if (normalized === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) return false;
  if (tab === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) {
    return (
      normalized === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
      normalized === VEHICLE_OPERATIONAL_STATUS.BLOCKED
    );
  }
  return normalized === tab;
}

export function countVehicleOperationalTab(
  vehicles: Array<{ status?: string | null }>,
  tab: VehicleOperationalTabStatus,
): number {
  return vehicles.filter((v) => vehicleOperationalStatusMatchesTab(v.status, tab)).length;
}

import type { StatusTone } from '../../../components/patterns';
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

/** All canonical operational status tokens — use for matrix tests and iteration. */
export const ALL_VEHICLE_OPERATIONAL_STATUSES = [
  VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  VEHICLE_OPERATIONAL_STATUS.RESERVED,
  VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
  VEHICLE_OPERATIONAL_STATUS.BLOCKED,
  VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
] as const satisfies readonly VehicleOperationalStatus[];

/** Editable operator tokens in Vehicle Detail header dropdown (write UI only). */
export type VehicleOperationalEditStatus = 'Available' | 'Manual Block' | 'Maintenance';

export const VEHICLE_OPERATIONAL_EDIT_STATUSES = [
  'Available',
  'Manual Block',
  'Maintenance',
] as const satisfies readonly VehicleOperationalEditStatus[];

const EDIT_TO_CANONICAL: Record<VehicleOperationalEditStatus, VehicleOperationalStatus> = {
  Available: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  'Manual Block': VEHICLE_OPERATIONAL_STATUS.BLOCKED,
  Maintenance: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
};

/** Preserve existing dropdown copy — not always identical to read-badge labels. */
const EDIT_STATUS_LABELS: Record<
  VehicleOperationalDisplayLocale,
  Record<VehicleOperationalEditStatus, string>
> = {
  de: {
    Available: 'Verfügbar',
    'Manual Block': 'Manual Block',
    Maintenance: 'Wartung',
  },
  en: {
    Available: 'Available',
    'Manual Block': 'Manual Block',
    Maintenance: 'Maintenance',
  },
};

const LABELS_DE: Record<VehicleOperationalStatus, string> = {
  [VEHICLE_OPERATIONAL_STATUS.AVAILABLE]: 'Verfügbar',
  [VEHICLE_OPERATIONAL_STATUS.RESERVED]: 'Reserviert',
  [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED]: 'Aktiv vermietet',
  [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE]: 'Wartung',
  [VEHICLE_OPERATIONAL_STATUS.BLOCKED]: 'Blockiert',
  [VEHICLE_OPERATIONAL_STATUS.UNKNOWN]: 'Status nicht verfügbar',
};

const LABELS_EN: Record<VehicleOperationalStatus, string> = {
  [VEHICLE_OPERATIONAL_STATUS.AVAILABLE]: 'Available',
  [VEHICLE_OPERATIONAL_STATUS.RESERVED]: 'Reserved',
  [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED]: 'Active Rented',
  [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE]: 'Maintenance',
  [VEHICLE_OPERATIONAL_STATUS.BLOCKED]: 'Blocked',
  [VEHICLE_OPERATIONAL_STATUS.UNKNOWN]: 'Status unavailable',
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

/** Map canonical operational status → editable header dropdown token. */
/** Prisma VehicleStatus values writable via admin status PATCH. */
export type VehicleOperationalPrismaStatus = 'AVAILABLE' | 'IN_SERVICE' | 'OUT_OF_SERVICE';

export function mapVehicleOperationalEditStatusToPrismaStatus(
  editStatus: VehicleOperationalEditStatus,
): VehicleOperationalPrismaStatus {
  switch (editStatus) {
    case 'Maintenance':
      return 'IN_SERVICE';
    case 'Manual Block':
      return 'OUT_OF_SERVICE';
    case 'Available':
    default:
      return 'AVAILABLE';
  }
}

export function mapCanonicalOperationalStatusToEditStatus(
  status: VehicleOperationalStatus,
): VehicleOperationalEditStatus {
  switch (status) {
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'Maintenance';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'Manual Block';
    case VEHICLE_OPERATIONAL_STATUS.UNKNOWN:
      return 'Manual Block';
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
    default:
      return 'Available';
  }
}

export function mapVehicleOperationalEditStatusToCanonical(
  editStatus: VehicleOperationalEditStatus,
): VehicleOperationalStatus {
  return EDIT_TO_CANONICAL[editStatus];
}

export function formatVehicleOperationalEditStatusLabel(
  editStatus: VehicleOperationalEditStatus,
  locale: VehicleOperationalDisplayLocale = 'de',
): string {
  return EDIT_STATUS_LABELS[locale][editStatus];
}

/** Canonical operational status → StatusChip tone. UNKNOWN is always neutral. */
export function operationalStatusToneFor(status: VehicleOperationalStatus): StatusTone {
  switch (status) {
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
      return 'success';
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
      return 'info';
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'warning';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'critical';
    case VEHICLE_OPERATIONAL_STATUS.UNKNOWN:
    default:
      return 'neutral';
  }
}

/** Canonical operational status → Icon name (presentational only). */
export function operationalStatusIconName(status: VehicleOperationalStatus): string {
  switch (status) {
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
      return 'check-circle';
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
      return 'car';
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
      return 'calendar';
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'wrench';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'x-circle';
    case VEHICLE_OPERATIONAL_STATUS.UNKNOWN:
    default:
      return 'alert-triangle';
  }
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

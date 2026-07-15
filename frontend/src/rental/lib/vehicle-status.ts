/**
 * Three-layer fleet operational status model — keep these strictly separate:
 *   • Prisma / DB truth : AVAILABLE | RENTED | IN_SERVICE | OUT_OF_SERVICE | RESERVED
 *   • UI key (this file): Available | Active Rented | Reserved | Maintenance | Unknown
 *   • UI label          : localised strings — labels only, NEVER used in filters.
 *
 * Fail-closed rule (Prompt 16): missing, unreliable, or unrecognised status values
 * map to `Unknown` — never silently to `Available`.
 */

export type FleetDataQualityState = 'RELIABLE' | 'DEGRADED' | 'UNAVAILABLE';

export type FleetStatusKey =
  | 'Available'
  | 'Active Rented'
  | 'Reserved'
  | 'Maintenance'
  | 'Unknown'
  /** Master-admin hard block label (VEHICLE_STATUS_MAP OUT_OF_SERVICE). */
  | 'Blocked'
  /** Legacy admin-only label — rental surfaces bucket under Maintenance. */
  | 'Unavailable';

export const CANONICAL_FLEET_STATUS_KEYS = [
  'Available',
  'Active Rented',
  'Reserved',
  'Maintenance',
  'Unknown',
] as const satisfies readonly FleetStatusKey[];

export const FLEET_STATUS_TAB_KEYS = [
  'Available',
  'Reserved',
  'Active Rented',
  'Maintenance',
] as const;

export type FleetStatusTabKey = (typeof FLEET_STATUS_TAB_KEYS)[number];

const EXACT_FLEET_STATUS: Record<string, FleetStatusKey> = {
  Available: 'Available',
  'Active Rented': 'Active Rented',
  Reserved: 'Reserved',
  Maintenance: 'Maintenance',
  Unknown: 'Unknown',
  Unavailable: 'Unavailable',
  Blocked: 'Blocked',
};

/**
 * Prisma enum → rental fleet status key. Mirrors backend RENTAL_STATUS_MAP.
 */
export const PRISMA_TO_FLEET_STATUS_KEY: Record<string, FleetStatusKey> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Maintenance',
  UNKNOWN: 'Unknown',
};

export interface NormalizeFleetStatusInput {
  status?: string | null;
  dataQualityState?: FleetDataQualityState | string | null;
  isReliable?: boolean | null;
}

export interface NormalizedFleetStatus {
  status: FleetStatusKey;
  dataQualityState: FleetDataQualityState | null;
  isReliable: boolean;
  isUnknown: boolean;
}

function normalizeDataQualityState(
  raw: FleetDataQualityState | string | null | undefined,
): FleetDataQualityState | null {
  if (!raw) return null;
  const upper = String(raw).trim().toUpperCase();
  if (upper === 'RELIABLE' || upper === 'DEGRADED' || upper === 'UNAVAILABLE') {
    return upper as FleetDataQualityState;
  }
  return null;
}

function mapLegacyStatusToken(raw: string): FleetStatusKey | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const exact = EXACT_FLEET_STATUS[trimmed];
  if (exact) return exact;

  const prisma = PRISMA_TO_FLEET_STATUS_KEY[trimmed.toUpperCase()];
  if (prisma) return prisma;

  const lower = trimmed.toLowerCase().replace(/_/g, ' ');
  if (lower === 'unknown' || lower === 'unk') return 'Unknown';
  if (lower.includes('active rented') || lower === 'rented' || lower === 'active') {
    return 'Active Rented';
  }
  if (lower.includes('reserved') || lower === 'reserviert') return 'Reserved';
  if (
    lower.includes('maintenance') ||
    lower.includes('in service') ||
    lower.includes('wartung') ||
    lower === 'blocked' ||
    lower.includes('out of service') ||
    lower.includes('unavailable')
  ) {
    if (lower === 'blocked') return 'Blocked';
    return lower.includes('unavailable') && !lower.includes('maintenance')
      ? 'Unavailable'
      : 'Maintenance';
  }
  if (lower === 'available' || lower === 'verfügbar' || lower === 'verfugbar') {
    return 'Available';
  }
  return null;
}

/**
 * Canonical fail-closed normalizer for fleet operational status.
 */
export function normalizeFleetOperationalStatus(
  input: NormalizeFleetStatusInput | string | null | undefined,
): NormalizedFleetStatus {
  const params: NormalizeFleetStatusInput =
    typeof input === 'string' || input == null ? { status: input } : input;

  const dataQualityState = normalizeDataQualityState(params.dataQualityState);
  const mapped = mapLegacyStatusToken(String(params.status ?? ''));

  if (dataQualityState === 'UNAVAILABLE') {
    return {
      status: 'Unknown',
      dataQualityState,
      isReliable: false,
      isUnknown: true,
    };
  }

  if (!mapped) {
    return {
      status: 'Unknown',
      dataQualityState,
      isReliable: false,
      isUnknown: true,
    };
  }

  if (mapped === 'Unknown') {
    return {
      status: 'Unknown',
      dataQualityState,
      isReliable: false,
      isUnknown: true,
    };
  }

  const isReliable =
    params.isReliable != null
      ? Boolean(params.isReliable)
      : dataQualityState == null || dataQualityState === 'RELIABLE';

  if (dataQualityState === 'DEGRADED' && params.isReliable === false) {
    return {
      status: 'Unknown',
      dataQualityState,
      isReliable: false,
      isUnknown: true,
    };
  }

  return {
    status: mapped,
    dataQualityState,
    isReliable,
    isUnknown: false,
  };
}

/** Shorthand when only the status string is available. */
export function normalizeFleetStatusKey(
  status: string | null | undefined,
  options: Omit<NormalizeFleetStatusInput, 'status'> = {},
): FleetStatusKey {
  return normalizeFleetOperationalStatus({ ...options, status }).status;
}

export function isFleetStatusUnknown(status: string | null | undefined): boolean {
  return normalizeFleetStatusKey(status) === 'Unknown';
}

export function isFleetStatusAvailableTab(status: string | null | undefined): boolean {
  return normalizeFleetStatusKey(status) === 'Available';
}

/** Ready-to-rent eligibility — only explicit Available, never Unknown. */
export function isFleetReadyForRent(status: string | null | undefined): boolean {
  return isFleetStatusAvailableTab(status);
}

/** Fleet status key → i18n label key suffix (dashboard.*). */
export const FLEET_STATUS_LABEL_KEY: Record<FleetStatusTabKey, string> = {
  Available: 'availableTab',
  Reserved: 'reservedTab',
  'Active Rented': 'activeRentedTab',
  Maintenance: 'maintenanceTab',
};

export function fleetStatusDisplayLabel(
  status: FleetStatusKey,
  locale?: string,
): string {
  const de = locale === 'de';
  switch (status) {
    case 'Available':
      return de ? 'Verfügbar' : 'Available';
    case 'Active Rented':
      return de ? 'Aktiv vermietet' : 'Active Rented';
    case 'Reserved':
      return de ? 'Reserviert' : 'Reserved';
    case 'Maintenance':
    case 'Unavailable':
      return de ? 'Wartung' : 'Maintenance';
    case 'Blocked':
      return de ? 'Blockiert' : 'Blocked';
    case 'Unknown':
    default:
      return de ? 'Unbekannt' : 'Unknown';
  }
}

/**
 * Match a vehicle's fleet read-model status to a dashboard tab key.
 * Unknown never matches Available (or any tab).
 */
export function fleetStatusMatchesTab(
  vehicleStatus: string | null | undefined,
  tab: FleetStatusTabKey,
): boolean {
  const normalized = normalizeFleetStatusKey(vehicleStatus);
  if (normalized === 'Unknown') return false;
  if (tab === 'Maintenance') {
    return (
      normalized === 'Maintenance' ||
      normalized === 'Unavailable' ||
      normalized === 'Blocked'
    );
  }
  return normalized === tab;
}

/** Count vehicles for a fleet status tab. */
export function countFleetStatusTab(
  vehicles: Array<{ status?: string | null }>,
  tab: FleetStatusTabKey,
): number {
  return vehicles.filter((v) => fleetStatusMatchesTab(v.status, tab)).length;
}

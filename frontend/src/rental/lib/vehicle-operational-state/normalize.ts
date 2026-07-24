import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleDataQualityState,
  type VehicleOperationalState,
  type VehicleOperationalStatus,
} from './types';

export interface NormalizeVehicleOperationalStatusInput {
  status?: string | null;
  dataQualityState?: VehicleDataQualityState | string | null;
  isReliable?: boolean | null;
}

export interface NormalizedVehicleOperationalStatus {
  status: VehicleOperationalStatus;
  dataQualityState: VehicleDataQualityState | null;
  isReliable: boolean;
  isUnknown: boolean;
}

const EXACT_LEGACY_STATUS: Record<string, VehicleOperationalStatus> = {
  Available: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  Reserved: VEHICLE_OPERATIONAL_STATUS.RESERVED,
  'Active Rented': VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  Rented: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  Maintenance: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
  Blocked: VEHICLE_OPERATIONAL_STATUS.BLOCKED,
  Unknown: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
  Unavailable: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
};

/** Prisma / backend enum tokens → canonical operational status. */
export const PRISMA_TO_VEHICLE_OPERATIONAL_STATUS: Record<string, VehicleOperationalStatus> = {
  AVAILABLE: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  RENTED: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  RESERVED: VEHICLE_OPERATIONAL_STATUS.RESERVED,
  IN_SERVICE: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
  OUT_OF_SERVICE: VEHICLE_OPERATIONAL_STATUS.BLOCKED,
  BLOCKED: VEHICLE_OPERATIONAL_STATUS.BLOCKED,
  UNKNOWN: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
};

function normalizeDataQualityState(
  raw: VehicleDataQualityState | string | null | undefined,
): VehicleDataQualityState | null {
  if (!raw) return null;
  const upper = String(raw).trim().toUpperCase();
  if (
    upper === VEHICLE_DATA_QUALITY_STATE.RELIABLE ||
    upper === VEHICLE_DATA_QUALITY_STATE.DEGRADED ||
    upper === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE
  ) {
    return upper as VehicleDataQualityState;
  }
  return null;
}

function mapLegacyStatusToken(raw: string): VehicleOperationalStatus | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const exact = EXACT_LEGACY_STATUS[trimmed];
  if (exact) return exact;

  const prisma = PRISMA_TO_VEHICLE_OPERATIONAL_STATUS[trimmed.toUpperCase()];
  if (prisma) return prisma;

  const lower = trimmed.toLowerCase().replace(/_/g, ' ');
  if (lower === 'unknown' || lower === 'unk') return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
  if (lower.includes('active rented') || lower === 'rented' || lower === 'active') {
    return VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  }
  if (lower.includes('reserved') || lower === 'reserviert') {
    return VEHICLE_OPERATIONAL_STATUS.RESERVED;
  }
  if (lower === 'blocked' || lower.includes('out of service')) {
    return lower === 'blocked'
      ? VEHICLE_OPERATIONAL_STATUS.BLOCKED
      : VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  }
  if (
    lower.includes('maintenance') ||
    lower.includes('in service') ||
    lower.includes('wartung') ||
    lower.includes('unavailable')
  ) {
    return VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  }
  if (lower === 'available' || lower === 'verfügbar' || lower === 'verfugbar') {
    return VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  }

  return null;
}

function unknownResult(
  dataQualityState: VehicleDataQualityState | null,
): NormalizedVehicleOperationalStatus {
  return {
    status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    dataQualityState,
    isReliable: false,
    isUnknown: true,
  };
}

/**
 * Fail-closed normalizer: unrecognised or unreliable values → UNKNOWN, never AVAILABLE.
 */
export function normalizeVehicleOperationalStatus(
  input: NormalizeVehicleOperationalStatusInput | string | null | undefined,
): NormalizedVehicleOperationalStatus {
  const params: NormalizeVehicleOperationalStatusInput =
    typeof input === 'string' || input == null ? { status: input } : input;

  const dataQualityState = normalizeDataQualityState(params.dataQualityState);
  const mapped = mapLegacyStatusToken(String(params.status ?? ''));

  if (dataQualityState === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE) {
    return unknownResult(dataQualityState);
  }

  if (!mapped) {
    return unknownResult(dataQualityState);
  }

  if (mapped === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) {
    return unknownResult(dataQualityState);
  }

  const isReliable =
    params.isReliable != null
      ? Boolean(params.isReliable)
      : dataQualityState == null || dataQualityState === VEHICLE_DATA_QUALITY_STATE.RELIABLE;

  if (
    dataQualityState === VEHICLE_DATA_QUALITY_STATE.DEGRADED &&
    params.isReliable === false
  ) {
    return unknownResult(dataQualityState);
  }

  return {
    status: mapped,
    dataQualityState,
    isReliable,
    isUnknown: false,
  };
}

export function normalizeVehicleOperationalStatusKey(
  status: string | null | undefined,
  options: Omit<NormalizeVehicleOperationalStatusInput, 'status'> = {},
): VehicleOperationalStatus {
  return normalizeVehicleOperationalStatus({ ...options, status }).status;
}

export function isVehicleOperationalStatusUnknown(
  status: string | null | undefined,
): boolean {
  return (
    normalizeVehicleOperationalStatusKey(status) === VEHICLE_OPERATIONAL_STATUS.UNKNOWN
  );
}

export function isVehicleOperationalStatusAvailable(
  status: string | null | undefined,
): boolean {
  return (
    normalizeVehicleOperationalStatusKey(status) === VEHICLE_OPERATIONAL_STATUS.AVAILABLE
  );
}

/** Ready-to-rent eligibility — only explicit AVAILABLE, never UNKNOWN. */
export function isVehicleReadyForRent(status: string | null | undefined): boolean {
  return isVehicleOperationalStatusAvailable(status);
}

export function normalizeVehicleOperationalStateDto(
  raw: Partial<VehicleOperationalState> | null | undefined,
  fallbackStatus?: string | null,
): VehicleOperationalState {
  const normalized = normalizeVehicleOperationalStatus({
    status: raw?.status ?? fallbackStatus,
    dataQualityState: raw?.dataQualityState,
    isReliable: raw?.isReliable,
  });

  return {
    status: normalized.status,
    reason: raw?.reason ?? null,
    source: raw?.source ?? null,
    effectiveFrom: raw?.effectiveFrom ?? null,
    effectiveUntil: raw?.effectiveUntil ?? null,
    derivedAt: raw?.derivedAt ?? null,
    dataQualityState: normalized.dataQualityState,
    dataQualityReasons: Array.isArray(raw?.dataQualityReasons)
      ? raw.dataQualityReasons.filter(Boolean)
      : [],
    isReliable: normalized.isReliable,
  };
}

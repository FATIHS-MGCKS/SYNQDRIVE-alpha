import type {
  CanonicalOperationalStatus,
  DataQualityReasonCode,
  DataQualityState,
  OperationalReasonCode,
  OperationalStateBlock,
  OperationalStateSource,
  RawStatusDiagnosticCode,
  RawVehicleStatusDiagnostic,
  VehicleStateEngineOutput,
} from './vehicle-operational-state.engine.types';

/**
 * V2 API projection of `operationalState` — machine-readable enums only (§16.3).
 */
export interface FleetOperationalStateDto {
  status: CanonicalOperationalStatus;
  reason: OperationalReasonCode;
  source: OperationalStateSource;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  derivedAt: string;
  dataQualityState: DataQualityState;
  dataQualityReasons: DataQualityReasonCode[];
  isReliable: boolean;
}

/** Diagnostic DB raw status — never used as operative fleet truth (§16.6). */
export interface FleetRawVehicleStatusDto {
  value: string;
  persistedAt: string | null;
  isLegacyOrInconsistent: boolean;
  diagnosticCodes: RawStatusDiagnosticCode[];
}

/**
 * Canonical operational projection for rental fleet read-models.
 * `status` is the deprecated V1 label — always derived from `operationalState.status`.
 */
export interface FleetOperationalStateProjection {
  /** @deprecated Prefer `operationalState.status` — legacy V1 label for active clients */
  status: string;
  operationalState: FleetOperationalStateDto;
  rawVehicleStatus?: FleetRawVehicleStatusDto;
}

const CANONICAL_TO_LEGACY_LABEL: Record<CanonicalOperationalStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  ACTIVE_RENTED: 'Active Rented',
  MAINTENANCE: 'Maintenance',
  BLOCKED: 'Blocked',
  UNKNOWN: 'Unknown',
};

/** Single source for legacy `status` string ↔ canonical `operationalState.status`. */
export function canonicalOperationalStatusToLegacyLabel(
  status: CanonicalOperationalStatus,
): string {
  return CANONICAL_TO_LEGACY_LABEL[status];
}

export function serializeOperationalStateBlock(
  block: OperationalStateBlock,
): FleetOperationalStateDto {
  return {
    status: block.status,
    reason: block.reason,
    source: block.source,
    effectiveFrom: block.effectiveFrom,
    effectiveUntil: block.effectiveUntil,
    derivedAt: block.derivedAt,
    dataQualityState: block.dataQualityState,
    dataQualityReasons: [...block.dataQualityReasons],
    isReliable: block.isReliable,
  };
}

export function serializeRawVehicleStatusDiagnostic(
  raw: RawVehicleStatusDiagnostic,
): FleetRawVehicleStatusDto {
  return {
    value: String(raw.value),
    persistedAt: raw.persistedAt,
    isLegacyOrInconsistent: raw.isLegacyOrInconsistent,
    diagnosticCodes: [...raw.diagnosticCodes],
  };
}

export function serializeFleetOperationalStateProjection(
  engineOutput: VehicleStateEngineOutput,
  options?: { includeRawVehicleStatus?: boolean },
): FleetOperationalStateProjection {
  const operationalState = serializeOperationalStateBlock(
    engineOutput.operationalState,
  );
  return {
    status: canonicalOperationalStatusToLegacyLabel(operationalState.status),
    operationalState,
    ...(options?.includeRawVehicleStatus
      ? {
          rawVehicleStatus: serializeRawVehicleStatusDiagnostic(
            engineOutput.rawVehicleStatus,
          ),
        }
      : {}),
  };
}

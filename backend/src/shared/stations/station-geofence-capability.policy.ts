import {
  getStationGeofenceCapabilityContractMetadata,
  STATION_GEOFENCE_CAPABILITY_VERSION,
  StationGeofenceCapabilityReasonCode,
  StationGeofenceCapabilityStatus,
} from './station-geofence-capability.contract';

export * from './station-geofence-capability.contract';

export interface StationGeofenceCapabilityInput {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  radiusMeters: number | null | undefined;
}

export interface StationGeofenceRuntimeFlags {
  shadowValidationEnabled?: boolean;
  productionWriterEnabled?: boolean;
  degraded?: boolean;
  degradedReason?: string | null;
}

export interface StationGeofenceCapabilityReason {
  code: StationGeofenceCapabilityReasonCode;
  message: string;
}

export interface StationGeofenceCapabilityResult {
  capabilityVersion: typeof STATION_GEOFENCE_CAPABILITY_VERSION;
  status: StationGeofenceCapabilityStatus;
  geofenceConfigured: boolean;
  automationActive: boolean;
  writesCurrentStationId: boolean;
  publishesConfirmedArrival: boolean;
  allowsAutomaticLocationDetectionClaim: boolean;
  reasons: StationGeofenceCapabilityReason[];
  uiHint: string;
}

function reason(
  code: StationGeofenceCapabilityReasonCode,
  message: string,
): StationGeofenceCapabilityReason {
  return { code, message };
}

function stationHasMissingCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return latitude == null || longitude == null;
}

export function isStationGeofenceConfigured(input: StationGeofenceCapabilityInput): boolean {
  if (stationHasMissingCoordinates(input.latitude, input.longitude)) {
    return false;
  }
  return input.radiusMeters != null;
}

function parseTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function resolveStationGeofenceRuntimeFlagsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StationGeofenceRuntimeFlags {
  return {
    shadowValidationEnabled: parseTruthyEnv(env.STATION_GEOFENCE_SHADOW_VALIDATION),
    productionWriterEnabled: parseTruthyEnv(env.STATION_GEOFENCE_PRODUCTION_WRITER),
    degraded: parseTruthyEnv(env.STATION_GEOFENCE_DEGRADED),
    degradedReason: env.STATION_GEOFENCE_DEGRADED_REASON?.trim() || null,
  };
}

function resolveStatus(
  input: StationGeofenceCapabilityInput,
  runtime: StationGeofenceRuntimeFlags,
): StationGeofenceCapabilityStatus {
  if (!isStationGeofenceConfigured(input)) {
    return StationGeofenceCapabilityStatus.NOT_CONFIGURED;
  }

  const automationRequested =
    runtime.productionWriterEnabled === true || runtime.shadowValidationEnabled === true;

  if (runtime.degraded === true && automationRequested) {
    return StationGeofenceCapabilityStatus.DEGRADED;
  }
  if (runtime.productionWriterEnabled === true) {
    return StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE;
  }
  if (runtime.shadowValidationEnabled === true) {
    return StationGeofenceCapabilityStatus.SHADOW_VALIDATION;
  }
  return StationGeofenceCapabilityStatus.CONFIGURED_ONLY;
}

function buildReasons(
  input: StationGeofenceCapabilityInput,
  status: StationGeofenceCapabilityStatus,
  runtime: StationGeofenceRuntimeFlags,
): StationGeofenceCapabilityReason[] {
  const reasons: StationGeofenceCapabilityReason[] = [];

  if (stationHasMissingCoordinates(input.latitude, input.longitude)) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.COORDINATES_MISSING,
        'Station coordinates are missing — geofence automation cannot run.',
      ),
    );
  }
  if (input.radiusMeters == null) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.RADIUS_MISSING,
        'Geofence radius is not configured.',
      ),
    );
  }

  if (status === StationGeofenceCapabilityStatus.CONFIGURED_ONLY) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.CONFIGURATION_COMPLETE,
        'Geofence coordinates and radius are configured.',
      ),
      reason(
        StationGeofenceCapabilityReasonCode.NO_ACTIVE_WRITER,
        'No active geofence writer updates currentStationId — configuration only.',
      ),
    );
  }

  if (status === StationGeofenceCapabilityStatus.SHADOW_VALIDATION) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.SHADOW_VALIDATION_ENABLED,
        'Shadow validation is enabled — hints only, no currentStationId writes.',
      ),
    );
  }

  if (status === StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.PRODUCTION_WRITER_ENABLED,
        'Production geofence writer flag is enabled.',
      ),
    );
  }

  if (status === StationGeofenceCapabilityStatus.DEGRADED) {
    reasons.push(
      reason(
        StationGeofenceCapabilityReasonCode.AUTOMATION_DEGRADED,
        runtime.degradedReason?.trim() ||
          'Geofence automation is degraded — check telemetry and rollout configuration.',
      ),
    );
  }

  reasons.push(
    reason(
      StationGeofenceCapabilityReasonCode.CONFIRMED_ARRIVAL_NOT_PUBLISHED,
      'Geofence arrival is never published as confirmed physical presence.',
    ),
  );

  return reasons;
}

function buildUiHint(status: StationGeofenceCapabilityStatus): string {
  switch (status) {
    case StationGeofenceCapabilityStatus.NOT_CONFIGURED:
      return 'Geofence nicht vollständig konfiguriert — keine automatische Standorterkennung.';
    case StationGeofenceCapabilityStatus.CONFIGURED_ONLY:
      return 'Geofence konfiguriert — keine automatische Standorterkennung aktiv.';
    case StationGeofenceCapabilityStatus.SHADOW_VALIDATION:
      return 'Geofence-Shadow-Validierung aktiv — nur Hinweise, keine bestätigte Ankunft.';
    case StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE:
      return 'Automatische Standorterkennung aktiv.';
    case StationGeofenceCapabilityStatus.DEGRADED:
      return 'Geofence-Automatisierung eingeschränkt — manuelle Bestätigung erforderlich.';
    default:
      return 'Geofence-Status unbekannt.';
  }
}

export function evaluateStationGeofenceCapability(
  input: StationGeofenceCapabilityInput,
  runtime: StationGeofenceRuntimeFlags = resolveStationGeofenceRuntimeFlagsFromEnv(),
): StationGeofenceCapabilityResult {
  const status = resolveStatus(input, runtime);
  const geofenceConfigured = isStationGeofenceConfigured(input);
  const writesCurrentStationId = status === StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE;
  const automationActive =
    status === StationGeofenceCapabilityStatus.SHADOW_VALIDATION ||
    status === StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE;
  const allowsAutomaticLocationDetectionClaim =
    status === StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE;

  return {
    capabilityVersion: STATION_GEOFENCE_CAPABILITY_VERSION,
    status,
    geofenceConfigured,
    automationActive,
    writesCurrentStationId,
    publishesConfirmedArrival: false,
    allowsAutomaticLocationDetectionClaim,
    reasons: buildReasons(input, status, runtime),
    uiHint: buildUiHint(status),
  };
}

export function getStationGeofenceCapabilityMetadata() {
  return getStationGeofenceCapabilityContractMetadata();
}

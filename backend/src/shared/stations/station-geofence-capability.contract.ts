export const STATION_GEOFENCE_CAPABILITY_VERSION = 1 as const;

export const StationGeofenceCapabilityStatus = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURED_ONLY: 'CONFIGURED_ONLY',
  SHADOW_VALIDATION: 'SHADOW_VALIDATION',
  PRODUCTION_ACTIVE: 'PRODUCTION_ACTIVE',
  DEGRADED: 'DEGRADED',
} as const;

export type StationGeofenceCapabilityStatus =
  (typeof StationGeofenceCapabilityStatus)[keyof typeof StationGeofenceCapabilityStatus];

export const StationGeofenceCapabilityReasonCode = {
  COORDINATES_MISSING: 'STATION_GEOFENCE_COORDINATES_MISSING',
  RADIUS_MISSING: 'STATION_GEOFENCE_RADIUS_MISSING',
  CONFIGURATION_COMPLETE: 'STATION_GEOFENCE_CONFIGURATION_COMPLETE',
  NO_ACTIVE_WRITER: 'STATION_GEOFENCE_NO_ACTIVE_WRITER',
  SHADOW_VALIDATION_ENABLED: 'STATION_GEOFENCE_SHADOW_VALIDATION_ENABLED',
  PRODUCTION_WRITER_ENABLED: 'STATION_GEOFENCE_PRODUCTION_WRITER_ENABLED',
  AUTOMATION_DEGRADED: 'STATION_GEOFENCE_AUTOMATION_DEGRADED',
  CONFIRMED_ARRIVAL_NOT_PUBLISHED: 'STATION_GEOFENCE_CONFIRMED_ARRIVAL_NOT_PUBLISHED',
} as const;

export type StationGeofenceCapabilityReasonCode =
  (typeof StationGeofenceCapabilityReasonCode)[keyof typeof StationGeofenceCapabilityReasonCode];

export interface StationGeofenceCapabilityReason {
  code: StationGeofenceCapabilityReasonCode;
  message: string;
}

export interface StationGeofenceShadowPlan {
  phase: 'SHADOW_VALIDATION';
  description: string;
  outputs: readonly string[];
  writesCurrentStationId: false;
  publishesConfirmedArrival: false;
  rolloutFlag: 'STATION_GEOFENCE_SHADOW_VALIDATION';
  followUpPrompt: string;
}

export interface StationGeofenceCapabilityContractMetadata {
  version: typeof STATION_GEOFENCE_CAPABILITY_VERSION;
  defaultStatus: typeof StationGeofenceCapabilityStatus.CONFIGURED_ONLY;
  statuses: StationGeofenceCapabilityStatus[];
  configurationRequires: readonly string[];
  writesCurrentStationId: false;
  publishesConfirmedArrival: false;
  allowsAutomaticLocationDetectionClaimWhen: readonly StationGeofenceCapabilityStatus[];
  runtimeFlags: readonly string[];
  shadowPlan: StationGeofenceShadowPlan;
}

export function getStationGeofenceCapabilityContractMetadata(): StationGeofenceCapabilityContractMetadata {
  return {
    version: STATION_GEOFENCE_CAPABILITY_VERSION,
    defaultStatus: StationGeofenceCapabilityStatus.CONFIGURED_ONLY,
    statuses: Object.values(StationGeofenceCapabilityStatus),
    configurationRequires: ['latitude', 'longitude', 'radiusMeters'],
    writesCurrentStationId: false,
    publishesConfirmedArrival: false,
    allowsAutomaticLocationDetectionClaimWhen: [StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE],
    runtimeFlags: [
      'STATION_GEOFENCE_SHADOW_VALIDATION',
      'STATION_GEOFENCE_PRODUCTION_WRITER',
      'STATION_GEOFENCE_DEGRADED',
      'STATION_GEOFENCE_DEGRADED_REASON',
    ],
    shadowPlan: {
      phase: 'SHADOW_VALIDATION',
      description:
        'Optional shadow mode computes HOME/AWAY/UNKNOWN hints in the read model without writing currentStationId or publishing confirmed arrivals.',
      outputs: ['GeofenceShadowDto: HOME | AWAY | UNKNOWN'],
      writesCurrentStationId: false,
      publishesConfirmedArrival: false,
      rolloutFlag: 'STATION_GEOFENCE_SHADOW_VALIDATION',
      followUpPrompt:
        'Dedicated Stations V2 prompt after capability status — DIMO GPS feeds shadow evidence only until production rollout prompt.',
    },
  };
}

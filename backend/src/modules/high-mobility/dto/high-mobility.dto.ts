/**
 * High Mobility Phase 1 + 2 — DTO definitions
 *
 * All enums use string literals matching Prisma enums.
 * DTOs are plain TS interfaces (no class-validator dependency required here;
 * validation is done at controller level with simple guards).
 */

// ── Shared types ────────────────────────────────────────────

export type HmPackageType = 'HEALTH' | 'FULL_TELEMETRY';
export type HmSourceMode  = 'DIMO_PLUS_HM' | 'HM_ONLY';

export type HmEligibilityStatus = 'UNKNOWN' | 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE' | 'ERROR';
export type HmDeliveryMode      = 'PULL' | 'PUSH' | 'BOTH';

export type HmClearanceStatus =
  | 'DRAFT'
  | 'CLEARANCE_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ERROR'
  | 'REVOKING'
  | 'REVOKED'
  | 'CANCELED';

export type HmSyncType   = 'MANUAL' | 'SCHEDULED' | 'POST_APPROVAL_INITIAL';
/**
 * MQTT_ONLY = HM Fleet Clearance vehicles (e.g. Mercedes-Benz) push data via MQTT only.
 * The REST command endpoint (/v1/vehicles/{ref}/command) does not exist for these vehicles.
 * Data arrives when the car is driven and Mercedes pushes telemetry.
 */
export type HmSyncStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'MQTT_ONLY';

// Phase 2 types
export type HmRegistrationState = 'NOT_REGISTERED' | 'REGISTRATION_PENDING' | 'REGISTERED' | 'REGISTRATION_FAILED';
export type HmStreamingState    = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type HmIngestStatus      = 'RECEIVED' | 'PARSED' | 'STORED' | 'FAILED' | 'DEDUPLICATED';
export type HmMqttConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'DISABLED';

// ── Eligibility ─────────────────────────────────────────────

export interface CheckEligibilityDto {
  vin: string;
  brand: string;
}

export interface EligibilityResultDto {
  vin: string;
  brand: string;
  eligibilityStatus: HmEligibilityStatus;
  deliveryMode: HmDeliveryMode | null;
  capabilities: Record<string, unknown> | null;
  checkedAt: string;
  rawResponse: Record<string, unknown> | null;
}

// ── Vehicle management ──────────────────────────────────────

export interface CreateHmVehicleDto {
  vin: string;
  brand: string;
  packageType: HmPackageType;
  sourceMode?: HmSourceMode;
  organizationId?: string;
}

// ── OEM routing ─────────────────────────────────────────────

/**
 * Onboarding path for a given OEM brand.
 *  ELIGIBILITY_FIRST      — BMW, Mercedes, Toyota, Renault, Ford, etc.
 *  DIRECT_FLEET_CLEARANCE — VW Group (Audi, VW, Skoda, SEAT, CUPRA) + Porsche
 *  UNKNOWN                — unrecognized brand; safe fallback tries direct clearance
 */
export type HmOemPath = 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';

export interface HmVehicleDto {
  id: string;
  organizationId: string | null;
  synqdriveVehicleId: string | null;
  vin: string;
  brand: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  eligibilityStatus: HmEligibilityStatus;
  eligibilityDeliveryMode: HmDeliveryMode | null;
  eligibilityCheckedAt: string | null;
  clearanceStatus: HmClearanceStatus;
  clearanceRequestedAt: string | null;
  clearanceApprovedAt: string | null;
  clearanceLastCheckedAt: string | null;
  hmVehicleReference: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  isActive: boolean;
  // Phase 2 fields
  registrationState: HmRegistrationState;
  registeredAt: string | null;
  streamingState: HmStreamingState;
  providerMode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HmVehicleListDto {
  health: HmVehicleDto[];
  fullTelemetry: HmVehicleDto[];
  total: number;
}

// ── Status history ──────────────────────────────────────────

export interface HmStatusHistoryDto {
  id: string;
  highMobilityVehicleId: string;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}

// ── Register flow integration ───────────────────────────────

export interface HmAvailabilityDto {
  vin: string;
  available: boolean;
  packageType: HmPackageType | null;
  clearanceStatus: HmClearanceStatus | null;
  hmVehicleId: string | null;
  isLinked: boolean;
  linkedVehicleId: string | null;
}

// ── Health data signals (Phase 1 — informational display only) ──

/** Normalized OEM health signal from HM provider */
export interface HmHealthSignalDto {
  signalId: string;
  value: unknown;
  unit: string | null;
  timestamp: string | null;
  rawKey: string;
}

export interface HmHealthDataDto {
  hmVehicleId: string;
  vin: string;
  fetchedAt: string;
  syncStatus: HmSyncStatus;
  errorMessage: string | null;
  signals: HmHealthSignalDto[];
  // Convenience accessors for UI integrations
  tirePressures: HmTirePressureDto | null;
  tirePressureStatuses: HmTirePressureStatusesDto | null;
  serviceInfo: HmServiceInfoDto | null;
}

export interface HmTirePressureDto {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit: string;
}

export interface HmTirePressureStatusesDto {
  frontLeft: string | null;
  frontRight: string | null;
  rearLeft: string | null;
  rearRight: string | null;
}

export interface HmServiceInfoDto {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
}

// ── Webhook ─────────────────────────────────────────────────

export interface HmWebhookPayloadDto {
  event: string;
  vin?: string;
  vehicleId?: string;
  status?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

// ── Phase 2: HM_ONLY Registration ───────────────────────────

export interface RegisterHmOnlyVehicleDto {
  hmVehicleId: string;           // The approved HM vehicle record
  organizationId: string;
  vehicleName?: string;
  licensePlate?: string;
  notes?: string;
  mileageKm?: number;
  fuelType?: string;
  vehicleType?: string;
}

export interface HmOnlyRegistrationResultDto {
  success: boolean;
  synqdriveVehicleId: string;
  hmVehicleId: string;
  vin: string;
  sourceMode: HmSourceMode;
  message: string;
}

// ── Phase 2: FULL_TELEMETRY Link ────────────────────────────

export interface LinkFullTelemetryDto {
  hmVehicleId: string;
}

// ── Phase 2: Streaming state ─────────────────────────────────

export interface HmStreamingReadinessDto {
  hmVehicleId: string;
  vin: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  clearanceStatus: HmClearanceStatus;
  streamingState: HmStreamingState;
  mqttEnabled: boolean;
  mqttConfigured: boolean;
  ready: boolean;
  checks: { key: string; label: string; ok: boolean; note?: string }[];
}

export interface HmMqttConsumerStatusDto {
  environment: string;
  applicationId: string;
  consumerGroup: string;
  connectionState: HmMqttConnectionState;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  mqttEnabled: boolean;
  certConfigured: boolean;
  updatedAt: string;
}

// ── Phase 2: Stream sync log ─────────────────────────────────

export interface HmStreamSyncLogDto {
  id: string;
  highMobilityVehicleId: string | null;
  vin: string | null;
  messageId: string;
  topic: string;
  messageTimestamp: string | null;
  ingestStatus: HmIngestStatus;
  isDuplicate: boolean;
  normalizedSummaryJson: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

// ── Phase 2: Normalized telemetry signal (source-agnostic staging) ──

export interface HmNormalizedTelemetryDto {
  messageId: string;
  vin: string;
  hmVehicleId: string | null;
  topic: string;
  messageTimestamp: string;
  // Source-agnostic fields — populated where signal is present in payload
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  ignitionOn: boolean | null;
  odometerId: number | null;
  fuelLevelPercent: number | null;
  batteryVoltage: number | null;
  engineCoolantTemperatureC: number | null;
  // Extended raw signals (keyed by signal identifier)
  rawSignals: Record<string, unknown>;
}

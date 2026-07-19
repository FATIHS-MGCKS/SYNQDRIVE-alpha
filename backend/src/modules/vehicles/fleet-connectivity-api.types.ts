import type {
  AttentionState,
  ConnectivityRecommendedAction,
  ConnectivityReasonCode,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from './connectivity/domain/connectivity-domain.types';
import type { TelemetryFreshness } from './vehicle-state-interpreter';
import type { FleetConnectivityVehicleDto } from './fleet-connectivity.types';

/** Fleet connectivity API v2 — list row contract. */
export interface FleetConnectivityVehicleRefDto {
  vehicleId: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  station: string | null;
}

export interface FleetConnectivityListItemDto {
  vehicle: FleetConnectivityVehicleRefDto;
  overallState: OverallConnectivityState;
  telemetryState: TelemetryFreshness;
  attentionState: AttentionState;
  lastTelemetryAt: string | null;
  primaryReasonCode: ConnectivityReasonCode | null;
  recommendedAction: ConnectivityRecommendedAction;
  requiresAction: boolean;
  /** Lower value = higher list priority (server-side default sort). */
  sortPriority: number;
}

export type FleetConnectivityTimelineEventType =
  | 'DEVICE_UNPLUGGED'
  | 'TELEMETRY_RESUMED'
  | 'DEVICE_RECONNECTED'
  | 'BINDING_CHANGED'
  | 'AUTHORIZATION_CHANGED'
  | 'INTEGRATION_ERROR';

export interface FleetConnectivityTimelineEventDto {
  id: string;
  type: FleetConnectivityTimelineEventType;
  /** Business event time — for recovery events this is `resolutionEvidenceAt`. */
  occurredAt: string;
  reasonCode: ConnectivityReasonCode | null;
  providerObservedAt?: string | null;
  receivedAt?: string | null;
  processedAt?: string | null;
  resolutionEvidenceAt?: string | null;
}

export interface FleetConnectivityActiveEpisodeDto {
  episodeId: string | null;
  open: boolean;
  openedAt: string | null;
  durationMs: number | null;
  rentalRelevant: boolean;
  recoveryMethod: string | null;
}

export interface FleetConnectivityCapabilitySignalDto {
  key: string;
  availability: 'available' | 'missing' | 'unknown' | 'not_applicable';
  freshness: 'fresh' | 'stale' | 'unknown';
}

export interface FleetConnectivityCapabilitySummaryDto {
  coverageState: DataCoverageState;
  coveragePercent: number | null;
  freshSignalCount: number;
  expectedSignalCount: number;
  signals: FleetConnectivityCapabilitySignalDto[];
}

export interface FleetConnectivityProviderSummaryDto {
  providerLabel: string;
  deviceKind: string;
  authorizationState: ProviderLinkState;
  consentGranted: boolean;
  triggerConfigured: boolean;
  lastSuccessfulFetchAt: string | null;
}

export interface FleetConnectivityTimestampsDto {
  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;
  calculatedAt: string;
  /** Business reconnection time (`resolutionEvidenceAt` of latest recovery). */
  reconnectedSince: string | null;
  /** When recovery evidence was received/processed server-side. */
  recoveryReceivedAt: string | null;
}

export interface FleetConnectivityWebhookSummaryDto {
  configured: boolean;
  lastEventAt: string | null;
  openEpisode: boolean;
}

/** Fleet connectivity API v2 — detail contract. */
export interface FleetConnectivityDetailDto extends FleetConnectivityListItemDto {
  providerLinkState: ProviderLinkState;
  physicalDeviceState: PhysicalDeviceState;
  dataCoverageState: DataCoverageState;
  reasonCodes: ConnectivityReasonCode[];
  activeEpisode: FleetConnectivityActiveEpisodeDto | null;
  timeline: FleetConnectivityTimelineEventDto[];
  provider: FleetConnectivityProviderSummaryDto;
  capabilities: FleetConnectivityCapabilitySummaryDto;
  timestamps: FleetConnectivityTimestampsDto;
  webhook: FleetConnectivityWebhookSummaryDto;
  odometerKm: number | null;
  hasLocation: boolean;
}

export interface FleetConnectivityKpiSummaryDto {
  total: number;
  actionRequired: number;
  actionRequiredOffline: number;
  actionRequiredSoftOffline: number;
  telemetryActive: number;
  standby: number;
  noActiveDataSource: number;
}

export interface FleetConnectivityApiResponseDto {
  generatedAt: string;
  summary: FleetConnectivityKpiSummaryDto;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalInOrganization: number;
  };
  items: FleetConnectivityListItemDto[];
  /**
   * @deprecated Use `items` — legacy full vehicle rows for transitional clients.
   */
  vehicles?: FleetConnectivityVehicleDto[];
}

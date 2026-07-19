import type {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  VehicleConnectivityRuntimeState,
  VehicleConnectivityTechnicalEvidence,
} from './domain/connectivity-domain.types';
import type { TelemetryFreshness } from '../vehicle-state-interpreter';

/** API-serializable connectivity runtime state — machine codes only. */
export interface VehicleConnectivityRuntimeStateDto {
  vehicleId: string;
  organizationId: string;
  overallState: OverallConnectivityState;
  providerLinkState: ProviderLinkState;
  telemetryState: TelemetryFreshness;
  physicalDeviceState: PhysicalDeviceState;
  dataCoverageState: DataCoverageState;
  attentionState: AttentionState;
  reasonCodes: ConnectivityReasonCode[];
  recommendedAction: ConnectivityRecommendedAction;
  requiresAction: boolean;
  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;
  deviceBindingId: string | null;
  activeEpisodeId: string | null;
  evidence: VehicleConnectivityTechnicalEvidence;
  calculatedAt: string;
  stateVersion: number;
}

export function serializeVehicleConnectivityRuntimeState(
  state: VehicleConnectivityRuntimeState,
): VehicleConnectivityRuntimeStateDto {
  return {
    vehicleId: state.vehicleId,
    organizationId: state.organizationId,
    overallState: state.overallState,
    providerLinkState: state.providerLinkState,
    telemetryState: state.telemetryState,
    physicalDeviceState: state.physicalDeviceState,
    dataCoverageState: state.dataCoverageState,
    attentionState: state.attentionState,
    reasonCodes: [...state.reasonCodes],
    recommendedAction: state.recommendedAction,
    requiresAction: state.requiresAction,
    lastTelemetryAt: state.lastTelemetryAt,
    lastProviderObservedAt: state.lastProviderObservedAt,
    lastReceivedAt: state.lastReceivedAt,
    deviceBindingId: state.deviceBindingId,
    activeEpisodeId: state.activeEpisodeId,
    evidence: { ...state.evidence },
    calculatedAt: state.calculatedAt,
    stateVersion: state.stateVersion,
  };
}

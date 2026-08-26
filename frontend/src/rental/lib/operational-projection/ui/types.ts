import type { StatusTone } from '../../../../components/patterns';
import type {
  ConnectivityAttentionState,
  ConnectivityRecommendedAction,
  FleetDataCoverageState,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from '../../../../lib/api';
import type { FleetHealthPresentation } from '../../fleet-health-evaluation/presentation';
import type { OperationalAvailabilityPresentation } from '../../operational-availability/presentation';
import type { PrimaryReasonPresentation } from './primary-reason-presentation';

export type VehicleOperationalAudience = 'org_admin' | 'master_admin' | 'worker';

export type UiPresentationPresence = 'present' | 'absent';

export interface UiPresentationSlice<T> {
  presence: UiPresentationPresence;
  presentation?: T;
}

export interface EnumFieldPresentation<T extends string> {
  state: T;
  label: string;
  tone: StatusTone;
}

export interface ConnectivityUiPresentation {
  overallState: UiPresentationSlice<EnumFieldPresentation<OverallConnectivityState>>;
  providerLinkState: UiPresentationSlice<EnumFieldPresentation<ProviderLinkState>>;
  telemetryState: UiPresentationSlice<EnumFieldPresentation<FleetTelemetryFreshness>>;
  physicalDeviceState: UiPresentationSlice<EnumFieldPresentation<PhysicalDeviceState>>;
  dataCoverageState: UiPresentationSlice<EnumFieldPresentation<FleetDataCoverageState>>;
  recommendedAction: UiPresentationSlice<{
    action: ConnectivityRecommendedAction;
    label: string;
  }>;
  reasonCodes: UiPresentationSlice<{
    items: PrimaryReasonPresentation[];
  }>;
}

export interface AttentionUiPresentation {
  attention: UiPresentationSlice<EnumFieldPresentation<ConnectivityAttentionState>>;
  primaryReason: UiPresentationSlice<PrimaryReasonPresentation>;
  recommendedAction: UiPresentationSlice<{
    action: ConnectivityRecommendedAction;
    label: string;
  }>;
  reasonCodes: UiPresentationSlice<{
    items: PrimaryReasonPresentation[];
  }>;
}

export interface OperatorUiPresentation {
  primaryReason: UiPresentationSlice<PrimaryReasonPresentation>;
  recommendedAction: UiPresentationSlice<{
    action: ConnectivityRecommendedAction;
    label: string;
  }>;
  attention: UiPresentationSlice<EnumFieldPresentation<ConnectivityAttentionState>>;
  reasonCodes: UiPresentationSlice<{
    items: PrimaryReasonPresentation[];
  }>;
}

export interface TechnicalDetailProjection {
  businessState: string | null;
  connectivityOverallState: OverallConnectivityState | null;
  connectivityProviderLinkState: ProviderLinkState | null;
  connectivityTelemetryState: FleetTelemetryFreshness | null;
  operationalAvailability: string | null;
  healthEvaluability: string | null;
  healthCondition: string | null;
  attention: ConnectivityAttentionState | null;
  primaryReason: string | null;
  recommendedAction: ConnectivityRecommendedAction | null;
  reasonCodes: readonly string[];
}

export interface VehicleOperationalUiProjection {
  vehicleId: string;
  audience: VehicleOperationalAudience;
  availability: UiPresentationSlice<OperationalAvailabilityPresentation>;
  health: UiPresentationSlice<FleetHealthPresentation>;
  connectivity: ConnectivityUiPresentation;
  attention: AttentionUiPresentation;
  operator: OperatorUiPresentation;
  technicalDetail?: TechnicalDetailProjection;
}

export interface MapVehicleOperationalUiProjectionOptions {
  audience: VehicleOperationalAudience;
  t: import('./primary-reason-presentation').OperationalTranslator;
}

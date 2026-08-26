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
import type { TranslationKey } from '../../../i18n/translations/en';
import type { FleetHealthConditionState, HealthEvaluabilityState } from '../../fleet-health-evaluation/types';
import type { OperationalAvailabilityState } from '../../operational-availability/types';
import type { PipelineAvailability } from '../field-semantics';
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

/** P1.2 — availability state labels + provenance-aware operator sub-fields. */
export interface AvailabilityUiPresentation {
  state: OperationalAvailabilityState;
  labelKey: TranslationKey;
  label: string;
  tone: StatusTone;
  tooltip: string | null;
  primaryReason: UiPresentationSlice<PrimaryReasonPresentation>;
  reasonCodes: UiPresentationSlice<{ items: PrimaryReasonPresentation[] }>;
  recommendedAction: UiPresentationSlice<{
    action: ConnectivityRecommendedAction;
    label: string;
  }>;
  attention: UiPresentationSlice<EnumFieldPresentation<ConnectivityAttentionState>>;
}

/** P1.2 — health evaluability labels + provenance-aware condition/pipeline sub-fields. */
export interface HealthUiPresentation {
  evaluability: HealthEvaluabilityState;
  labelKey: TranslationKey;
  label: string;
  tone: StatusTone;
  tooltip: string | null;
  isEvaluable: boolean;
  secondaryLabel: string | null;
  condition: UiPresentationSlice<{
    state: FleetHealthConditionState;
    label: string;
    tone: StatusTone;
  }>;
  pipelineAvailability: UiPresentationSlice<{
    value: PipelineAvailability;
  }>;
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
  availability: UiPresentationSlice<AvailabilityUiPresentation>;
  health: UiPresentationSlice<HealthUiPresentation>;
  connectivity: ConnectivityUiPresentation;
  attention: AttentionUiPresentation;
  operator: OperatorUiPresentation;
  technicalDetail?: TechnicalDetailProjection;
}

export interface MapVehicleOperationalUiProjectionOptions {
  audience: VehicleOperationalAudience;
  t: import('./primary-reason-presentation').OperationalTranslator;
}

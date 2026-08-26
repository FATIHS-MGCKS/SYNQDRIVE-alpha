/**
 * P1.1 — Canonical frontend operational-state contract.
 *
 * Normalizes backend P0.1/P0.2/P0.3/P0.4 fleet-map slices into one stable view.
 * No UI labels, no timestamp-derived derivations, no legacy onlineStatus paths.
 */
import type {
  ConnectivityAttentionState,
  ConnectivityRecommendedAction,
  FleetDataCoverageState,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from '../../../lib/api';
import type { FleetHealthConditionState, HealthEvaluabilityState } from '../fleet-health-evaluation/types';
import type { OperationalAvailabilityState } from '../operational-availability/types';

/** P0.2 business workflow state — preserved verbatim when supplied by backend. */
export type BusinessOperationalState =
  | 'AVAILABLE'
  | 'RENTED'
  | 'RESERVED'
  | 'IN_SERVICE'
  | 'OUT_OF_SERVICE'
  | 'UNKNOWN';

/** Which backend slice supplied a canonical field value. */
export type OperationalFieldSource =
  | 'fleet_map.connectivityRuntime'
  | 'fleet_map.operationalAvailability'
  | 'fleet_map.healthEvaluation'
  | 'fleet_connectivity.detail'
  | 'absent';

export type FieldPresence = 'present' | 'absent';

/**
 * Wraps a canonical value with explicit provenance.
 * `presence: 'present'` + `value: 'UNKNOWN'` means the backend supplied UNKNOWN.
 * `presence: 'absent'` means the slice/field was not available in the input.
 */
export interface CanonicalField<T> {
  value: T | undefined;
  presence: FieldPresence;
  source: OperationalFieldSource;
}

export interface CanonicalVehicleOperationalView {
  vehicleId: string;

  business: {
    businessState: CanonicalField<BusinessOperationalState>;
    operationalAvailability: CanonicalField<OperationalAvailabilityState>;
  };

  connectivity: {
    overallState: CanonicalField<OverallConnectivityState>;
    providerLinkState: CanonicalField<ProviderLinkState>;
    telemetryState: CanonicalField<FleetTelemetryFreshness>;
    physicalDeviceState: CanonicalField<PhysicalDeviceState>;
    dataCoverageState: CanonicalField<FleetDataCoverageState>;
    attentionState: CanonicalField<ConnectivityAttentionState>;
    reasonCodes: CanonicalField<readonly string[]>;
    recommendedAction: CanonicalField<ConnectivityRecommendedAction>;
  };

  health: {
    evaluability: CanonicalField<HealthEvaluabilityState>;
    condition: CanonicalField<FleetHealthConditionState>;
    pipelineAvailability: CanonicalField<'ready' | 'partial' | 'unavailable' | null>;
  };

  operator: {
    primaryReason: CanonicalField<string | null>;
    recommendedAction: CanonicalField<string>;
    attention: CanonicalField<string>;
    reasonCodes: CanonicalField<readonly string[]>;
  };
}

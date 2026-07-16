/**
 * Domain types for transmission / brake / wheel / motion chassis signals (P31).
 *
 * Observation states are explicit — null is never treated as a real measurement.
 * No detector or health evaluation flags; capability context is required upstream.
 */
import type {
  CanonicalDrivingSignalKey,
  CanonicalSignalUnit,
  CanonicalSignalUsageScope,
} from './canonical-driving-signal-mapper.types';

export const CHASSIS_SIGNAL_DOMAIN_VERSION = 'chassis-signal-v1';

/** Fleet-realistic observation state for chassis-family signals. */
export type ChassisSignalObservationState =
  | 'available'
  | 'null_sample'
  | 'stale'
  | 'unsupported';

export type ChassisSignalFamily = 'TRANSMISSION' | 'BRAKE' | 'WHEEL' | 'MOTION';

export type ChassisSignalCapabilityContext = {
  /** DIMO names with SUPPORTED capability from preflight / persisted probes. */
  supportedDimoSignals: ReadonlySet<string> | readonly string[];
  capabilityVersion?: string | null;
};

export type ChassisSignalObservationBase = {
  state: ChassisSignalObservationState;
  family: ChassisSignalFamily;
  canonicalKey: CanonicalDrivingSignalKey;
  dimoSignalName: string;
  domainVersion: typeof CHASSIS_SIGNAL_DOMAIN_VERSION;
  /** Never true in P31 — detectors require explicit future gates. */
  detectorEligible: false;
  /** Never true in P31 — health modules require explicit future gates. */
  healthEvaluationEligible: false;
  tripDetectionEligible: false;
};

export type ChassisSignalObservationAvailable = ChassisSignalObservationBase & {
  state: 'available';
  value: number;
  unit: CanonicalSignalUnit;
  observedAt: Date;
  receivedAt: Date;
  providerUnit: string | null;
  usageScope: CanonicalSignalUsageScope;
  mappingVersion: string;
};

export type ChassisSignalObservationNull = ChassisSignalObservationBase & {
  state: 'null_sample';
  reason: 'provider_null_not_observation';
  observedAt: Date | null;
};

export type ChassisSignalObservationStale = ChassisSignalObservationBase & {
  state: 'stale';
  reason: 'observation_stale';
  observedAt: Date;
  receivedAt: Date;
  ageMs: number;
  staleAfterMs: number;
};

export type ChassisSignalObservationUnsupported = ChassisSignalObservationBase & {
  state: 'unsupported';
  reason:
    | 'capability_not_supported'
    | 'powertrain_not_applicable'
    | 'unknown_dimo_signal'
    | 'invalid_numeric_value'
    | 'provider_unit_unknown';
};

export type ChassisSignalObservation =
  | ChassisSignalObservationAvailable
  | ChassisSignalObservationNull
  | ChassisSignalObservationStale
  | ChassisSignalObservationUnsupported;

/**
 * Central driving detector capability model (P32).
 *
 * Determines which detectors are fachlich supported per vehicle based on
 * persisted capability probes — never hardware type alone.
 */
import type { HardwareType } from '@prisma/client';
import type { ResolvedVehicleDrivingCapability } from '../driving-capability/vehicle-driving-capability.types';

export const DRIVING_DETECTOR_CAPABILITY_VERSION = 'driving-detector-cap-v1';

export type DrivingDetectorKey =
  | 'native_harsh_events'
  | 'cold_engine_load'
  | 'start_kickdown_proxy'
  | 'rev_in_idle'
  | 'sustained_high_load'
  | 'gear_stress'
  | 'brake_intensity'
  | 'wheel_slip'
  | 'yaw_cornering'
  | 'ev_power_demand'
  | 'idling_segment';

export type DrivingDetectorSupportStatus =
  | 'PRODUCTION'
  | 'SHADOW'
  | 'CONTEXT_ONLY'
  | 'PROVIDER_DEPENDENT'
  | 'UNSUPPORTED'
  | 'TEMPORARILY_DEGRADED';

export type DrivingDetectorRequirementKind = 'signal' | 'native_event' | 'segment_detector';

export type DrivingDetectorRequirement = {
  kind: DrivingDetectorRequirementKind;
  name: string;
};

export type DrivingDetectorReasonCode =
  | 'MISSING_REQUIRED_SIGNAL'
  | 'MISSING_REQUIRED_NATIVE_EVENT'
  | 'NATIVE_EVENTS_NOT_OBSERVED'
  | 'NATIVE_EVENTS_AVAILABLE'
  | 'INSUFFICIENT_CADENCE'
  | 'INSUFFICIENT_COVERAGE'
  | 'CAPABILITY_DEGRADED'
  | 'POWERTRAIN_NOT_APPLICABLE'
  | 'STATUS_CAPPED'
  | 'SEGMENTS_NOT_SUPPORTED'
  | 'NO_AUTOMATIC_PRODUCTION';

export type ResolvedDrivingDetectorCapability = {
  detectorKey: DrivingDetectorKey;
  label: string;
  status: DrivingDetectorSupportStatus;
  reasons: DrivingDetectorReasonCode[];
  requiredSignals: string[];
  requiredNativeEvents: string[];
  requiredSegmentDetectors: string[];
  missingRequirements: string[];
  capabilityVersion: string;
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  coverage: number | null;
  /** Hardware profile is diagnostic only — never used to upgrade status. */
  hardwareType: HardwareType | null;
};

export type DrivingDetectorCapabilityResult = {
  resolverVersion: typeof DRIVING_DETECTOR_CAPABILITY_VERSION;
  capabilityVersion: string;
  hardwareType: HardwareType | null;
  fuelType: string | null;
  hardwareBaselineLabel: string | null;
  resolvedAt: string;
  detectors: ResolvedDrivingDetectorCapability[];
};

export type DrivingDetectorCapabilityResolverInput = {
  hardwareType: HardwareType | null;
  fuelType: string | null;
  hardwareBaselineLabel?: string | null;
  capabilities: readonly ResolvedVehicleDrivingCapability[];
  capabilityVersion?: string | null;
  resolvedAt?: Date;
};

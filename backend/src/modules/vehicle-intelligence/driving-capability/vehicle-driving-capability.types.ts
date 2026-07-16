import type {
  DrivingCapabilityStatus,
  HardwareType,
  VehicleDrivingCapability,
} from '@prisma/client';

/** Known provider channels for capability probes (string column — extensible). */
export const DRIVING_CAPABILITY_PROVIDER = {
  DIMO_TELEMETRY: 'DIMO_TELEMETRY',
  HF_LOCAL: 'HF_LOCAL',
  INTERNAL_DETECTOR: 'INTERNAL_DETECTOR',
  MAPBOX: 'MAPBOX',
} as const;

export type DrivingCapabilityProviderSource =
  (typeof DRIVING_CAPABILITY_PROVIDER)[keyof typeof DRIVING_CAPABILITY_PROVIDER];

/** Canonical native DIMO behavior signals probed per vehicle. */
export const NATIVE_BEHAVIOR_SIGNALS = {
  HARSH_ACCELERATION: 'behavior.harshAcceleration',
  HARSH_BRAKING: 'behavior.harshBraking',
  HARSH_CORNERING: 'behavior.harshCornering',
} as const;

export type UpsertVehicleDrivingCapabilityInput = {
  organizationId: string;
  vehicleId: string;
  hardwareProfile: HardwareType;
  providerSource: string;
  signalName?: string | null;
  detectorName?: string | null;
  capabilityStatus: DrivingCapabilityStatus;
  checkedAt: Date;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  effectiveCadenceMs?: number | null;
  p95CadenceMs?: number | null;
  coverage?: number | null;
  nativeEventAvailable?: boolean;
  metadata?: Record<string, unknown> | null;
  capabilityVersion: string;
};

export type ResolvedVehicleDrivingCapability = {
  organizationId: string;
  vehicleId: string;
  providerSource: string;
  capabilityKey: string;
  signalName: string | null;
  detectorName: string | null;
  capabilityStatus: DrivingCapabilityStatus;
  nativeEventAvailable: boolean | null;
  hardwareProfile: HardwareType | null;
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  coverage: number | null;
  checkedAt: Date | null;
  /** `persisted` when a probe row exists; `none` when absent (never hardware-inferred). */
  resolutionSource: 'persisted' | 'none';
  row: VehicleDrivingCapability | null;
};

export type VehicleDrivingCapabilitySnapshot = {
  vehicleId: string;
  organizationId: string;
  capabilities: ResolvedVehicleDrivingCapability[];
  /** Static hardware matrix — diagnostics only, not used for availability decisions. */
  hardwareBaselineLabel: string | null;
};

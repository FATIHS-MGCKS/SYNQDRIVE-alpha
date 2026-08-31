import type { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';

export type ReferenceCaptureTemporalClass =
  | 'WAVEFORM_DYNAMICS'
  | 'POWERTRAIN_DYNAMIC'
  | 'SPATIAL_ROUTE'
  | 'SLOW_PHYSICAL_CONTEXT'
  | 'HEALTH_DIAGNOSTIC'
  | 'EVENT'
  | 'SESSION_METADATA';

export type ReferenceCaptureCapabilityState =
  | 'SCHEMA_SUPPORTED'
  | 'LISTED_AVAILABLE'
  | 'OBSERVED_NON_NULL'
  | 'LISTED_BUT_NULL'
  | 'DIRECT_PROBE_SUPPORTED'
  | 'DIRECT_PROBE_NULL'
  | 'NOT_AVAILABLE_ON_VEHICLE'
  | 'UNKNOWN';

export type BroadObservationFieldDescriptor = {
  providerField: string;
  canonicalKey: string | null;
  rawIdentity: string;
  temporalClass: ReferenceCaptureTemporalClass;
  acquisitionTier: string;
  capabilityState: ReferenceCaptureCapabilityState;
};

export type ReferenceCapturePreflightResult = {
  availableSignals: string[];
  broadObservationFields: BroadObservationFieldDescriptor[];
  broadObservationFieldCount: number;
  manifestId: string;
  manifestVersion: string;
  connectionProfile: string;
  powertrainProfile: string | null;
  hardwareProfile: string | null;
  checkedAt: string;
};

export type VehicleMassBinding = {
  baseVehicleMassKg: number | null;
  massSource: 'MANUFACTURER_CURB_WEIGHT' | 'UNKNOWN';
  massConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  optionalSessionPayloadKg: number | null;
  effectiveMassKg: number | null;
  frontWeightDistributionPct: number | null;
  limitationNote: string;
};

export type ReferenceCaptureObservationEnvelope = {
  envelopeVersion: string;
  observationKind: ReferenceCaptureObservationKind;
  provider: string;
  connectionProfile: string;
  powertrainProfile?: string | null;
  providerField?: string | null;
  canonicalKey?: string | null;
  rawIdentity: string;
  acquisitionSurface?: string | null;
  acquisitionTier?: string | null;
  temporalClass?: string | null;
  rawValue: unknown;
  rawUnit?: string | null;
  normalizedValue?: unknown;
  normalizedUnit?: string | null;
  providerTimestamp?: Date | string | null;
  synqReceivedAt: Date | string;
  requestStartedAt?: Date | string | null;
  requestCompletedAt?: Date | string | null;
  requestCorrelationId?: string | null;
  sequenceNumber?: number | null;
  capabilityState?: string | null;
  provenance?: Record<string, unknown> | null;
};

export type CreateReferenceCaptureSessionInput = {
  organizationId: string;
  vehicleId: string;
  connectionProfile?: string;
  groundTruthVideoRef?: string | null;
};

export type ReferenceCaptureSessionView = {
  id: string;
  organizationId: string;
  vehicleId: string;
  connectionProfile: string;
  powertrainProfile: string | null;
  hardwareProfile: string | null;
  manifestId: string;
  manifestVersion: string;
  status: ReferenceCaptureSessionStatus;
  recorderSoftwareVersion: string | null;
  broadObservationFieldCount: number | null;
  massBinding: VehicleMassBinding | null;
  preflight: ReferenceCapturePreflightResult | null;
  failureReason: string | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReferenceCaptureRetentionPolicy = {
  retentionDays: number;
  justification: string;
  estimatedBytesPerObservation: number;
  estimatedObservationsPerMinutePerSignal: number;
  estimatedBytesPerHourBroadCapture: number;
};

export type ReferenceCaptureStressEstimate = {
  observationsPerMinute: number;
  observationsPerHour: number;
  estimatedBytesPerHour: number;
  batchSize: number;
  maxPendingObservations: number;
  backpressureStrategy: string;
};

export type ManifestCanonicalSignal = {
  canonicalKey: string;
  providerField: string;
  providerUnit?: string;
  canonicalUnit?: string;
  captureClass?: string;
  acquisitionTiers?: string[];
};

export type FrozenReferenceManifest = {
  manifestId: string;
  manifestVersion: string;
  connectionProfile: string;
  hardwareProfile: string;
  canonicalSignals: ManifestCanonicalSignal[];
  temporalAcquisitionClasses?: {
    classes?: Record<string, { examples?: string[] }>;
  };
};

export type ReferenceCaptureValidationIssue = {
  code: string;
  message: string;
};

export type ReferenceCaptureValidationResult =
  | { ok: true }
  | { ok: false; issues: ReferenceCaptureValidationIssue[] };

export type NormalizedReferenceCaptureObservation = ReferenceCaptureObservationEnvelope & {
  sessionId: string;
  organizationId: string;
  vehicleId: string;
};

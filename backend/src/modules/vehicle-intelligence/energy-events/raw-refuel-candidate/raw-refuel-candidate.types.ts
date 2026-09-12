import type {
  RawRefuelAbsoluteSignalTrust,
  RawRefuelCandidateLifecycleState,
  RawRefuelCandidateRejectionReason,
  RawRefuelCandidateSignalChannel,
} from '@prisma/client';

export type RawRefuelCandidateOverlapClassification =
  | 'SAME_PHYSICAL_RISE'
  | 'DISTINCT_PHYSICAL_RISE'
  | 'INSUFFICIENT_EVIDENCE';

/** Normalized detector output supplied to persistence (not the F3 detector itself). */
export interface RawRefuelCandidateObservation {
  organizationId: string;
  vehicleId: string;
  detectionVersion: string;
  detectorVersion: string;
  signalChannel: RawRefuelCandidateSignalChannel;
  lifecycleState: RawRefuelCandidateLifecycleState;
  rejectionReason?: RawRefuelCandidateRejectionReason | null;
  physicalEvidenceStart?: Date | null;
  physicalEvidenceEnd?: Date | null;
  riseOnsetAt?: Date | null;
  riseEndAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  postFuelAbsoluteLiters?: number | null;
  deltaAbsoluteLiters?: number | null;
  preFuelRelativePercent?: number | null;
  postFuelRelativePercent?: number | null;
  deltaRelativePercent?: number | null;
  prePlateauSampleCount?: number | null;
  postPlateauSampleCount?: number | null;
  totalSampleCount?: number | null;
  maxSampleGapSeconds?: number | null;
  absoluteSignalTrust?: RawRefuelAbsoluteSignalTrust | null;
  relativeSignalAvailable?: boolean | null;
  routeEvidenceAvailable?: boolean | null;
  stationaryEvidenceAvailable?: boolean | null;
  scanWindowStart?: Date | null;
  scanWindowEnd?: Date | null;
  signalProvider?: string | null;
  evidenceMeta?: Record<string, unknown> | null;
  qualityMeta?: Record<string, unknown> | null;
}

export interface RawRefuelCandidateEvidenceSlice {
  organizationId: string;
  vehicleId: string;
  detectionVersion: string;
  signalChannel: RawRefuelCandidateSignalChannel;
  physicalEvidenceStart?: Date | null;
  physicalEvidenceEnd?: Date | null;
  riseOnsetAt?: Date | null;
  riseEndAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  postFuelAbsoluteLiters?: number | null;
  deltaAbsoluteLiters?: number | null;
  preFuelRelativePercent?: number | null;
  postFuelRelativePercent?: number | null;
  deltaRelativePercent?: number | null;
  prePlateauSampleCount?: number | null;
  postPlateauSampleCount?: number | null;
  totalSampleCount?: number | null;
  maxSampleGapSeconds?: number | null;
  absoluteSignalTrust?: RawRefuelAbsoluteSignalTrust | null;
  relativeSignalAvailable?: boolean | null;
  routeEvidenceAvailable?: boolean | null;
  stationaryEvidenceAvailable?: boolean | null;
  scanWindowStart?: Date | null;
  scanWindowEnd?: Date | null;
  signalProvider?: string | null;
  evidenceMeta?: Record<string, unknown> | null;
  qualityMeta?: Record<string, unknown> | null;
}

export interface RawRefuelCandidateResolveResult {
  candidateId: string;
  candidateIdentityKey: string | null;
  evidenceRevisionFingerprint: string;
  lifecycleState: RawRefuelCandidateLifecycleState;
  created: boolean;
  updated: boolean;
}

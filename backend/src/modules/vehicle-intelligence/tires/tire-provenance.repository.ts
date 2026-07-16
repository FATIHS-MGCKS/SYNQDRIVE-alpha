import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import {
  isGroundTruthEvidenceSource,
  mapLegacyMeasurementSourceToEvidence,
} from './tire-evidence-source';

export interface WearDataPointProvenanceInput {
  predictedTreadMm: number;
  actualTreadMm: number;
  measurementId: string;
  measurementSource: string;
  evidenceSource?: TireEvidenceSource | null;
  measuredAt: Date;
  predictionGeneratedAt: Date;
  modelVersion?: string | null;
  modelConfigHash?: string | null;
  predictionSnapshotId?: string | null;
}

export interface WearDataPointProvenanceFields {
  isGroundTruth: boolean;
  actualSource: TireEvidenceSource | null;
  actualMeasurementId: string;
  actualMeasuredAt: Date;
  predictionGeneratedAt: Date;
  modelVersion: string | null;
  modelConfigHash: string | null;
  predictionSnapshotId: string | null;
}

export interface SnapshotProvenanceInput {
  modelVersion?: string | null;
  modelConfigHash?: string | null;
  inputFingerprint?: string | null;
  baselineSource?: TireEvidenceSource | null;
  evidenceSummary?: Record<string, unknown> | null;
}

export interface SnapshotProvenanceFields {
  modelVersion: string | null;
  modelConfigHash: string | null;
  inputFingerprint: string | null;
  baselineSource: TireEvidenceSource | null;
  evidenceSummary: Record<string, unknown> | null;
}

/**
 * Assembles nullable provenance columns for TireWearDataPoint inserts.
 * Does not persist — callers use at write time (Prompt 4+).
 */
export function buildWearDataPointProvenance(
  input: WearDataPointProvenanceInput,
): WearDataPointProvenanceFields {
  const actualSource =
    input.evidenceSource ??
    mapLegacyMeasurementSourceToEvidence(input.measurementSource);

  const isGroundTruth =
    actualSource != null && isGroundTruthEvidenceSource(actualSource);

  return {
    isGroundTruth,
    actualSource,
    actualMeasurementId: input.measurementId,
    actualMeasuredAt: input.measuredAt,
    predictionGeneratedAt: input.predictionGeneratedAt,
    modelVersion: input.modelVersion ?? null,
    modelConfigHash: input.modelConfigHash ?? null,
    predictionSnapshotId: input.predictionSnapshotId ?? null,
  };
}

export function buildSnapshotProvenance(
  input: SnapshotProvenanceInput,
): SnapshotProvenanceFields {
  return {
    modelVersion: input.modelVersion ?? null,
    modelConfigHash: input.modelConfigHash ?? null,
    inputFingerprint: input.inputFingerprint ?? null,
    baselineSource: input.baselineSource ?? null,
    evidenceSummary: input.evidenceSummary ?? null,
  };
}

export interface SetupBaselineProvenanceInput {
  evidenceSource?: TireEvidenceSource | null;
  measuredAt?: Date | null;
  confirmedAt?: Date | null;
  evidenceId?: string | null;
  baselineConfidence?: number | null;
  baselineStatus?: TireBaselineStatus | null;
}

export interface SetupBaselineProvenanceFields {
  initialTreadEvidenceSource: TireEvidenceSource | null;
  initialTreadMeasuredAt: Date | null;
  initialTreadConfirmedAt: Date | null;
  initialTreadEvidenceId: string | null;
  baselineConfidence: number | null;
  baselineStatus: TireBaselineStatus | null;
}

export function buildSetupBaselineProvenance(
  input: SetupBaselineProvenanceInput,
): SetupBaselineProvenanceFields {
  return {
    initialTreadEvidenceSource: input.evidenceSource ?? null,
    initialTreadMeasuredAt: input.measuredAt ?? null,
    initialTreadConfirmedAt: input.confirmedAt ?? null,
    initialTreadEvidenceId: input.evidenceId ?? null,
    baselineConfidence: input.baselineConfidence ?? null,
    baselineStatus: input.baselineStatus ?? null,
  };
}

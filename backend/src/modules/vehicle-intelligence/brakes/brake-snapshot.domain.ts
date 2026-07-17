import {
  aggregateBrakeCondition,
  buildRemainingKmRange,
  classifyConfidenceLevel,
  classifyEstimatedCondition,
  type BrakeCondition,
  type BrakeConfidenceLevel,
} from './brake-status';
import type { BrakeCoverageGapAssessment } from './brake-coverage-gap.domain';
import type { BrakeRecalculationInputContext } from './brake-recalculation-fingerprint';
import {
  buildSnapshotPredictionPayload,
  type BrakeSnapshotPredictionPayload,
} from './brake-wear-model-version';

export interface BrakeSnapshotAlertSummary {
  type: string;
  severity: string;
  message: string;
  value?: number | null;
}

export interface BrakeSnapshotRemainingRange {
  pads: { min: number; max: number } | null;
  discs: { min: number; max: number } | null;
  front: { min: number; max: number } | null;
  rear: { min: number; max: number } | null;
}

export interface BrakeSnapshotConfidence {
  score: number;
  label: string;
}

export interface BrakeAnchorEvidenceSummary {
  anchorServiceDate: string | null;
  anchorOdometerKm: number | null;
  anchorValidationStatus: string | null;
  calibrationCount: number;
  frontPadAnchorMm: number | null;
  rearPadAnchorMm: number | null;
  frontDiscAnchorMm: number | null;
  rearDiscAnchorMm: number | null;
  evidenceIds: string[];
  prediction?: BrakeSnapshotPredictionPayload;
  modelVersion?: string;
  modelConfigHash?: string;
  predictionGeneratedAt?: string;
}

export function buildAnchorEvidenceSummary(args: {
  inputContext: BrakeRecalculationInputContext;
  predictionPayload: BrakeSnapshotPredictionPayload;
}): BrakeAnchorEvidenceSummary {
  const evidenceIds = args.inputContext.evidence.map((row) => row.id);
  return {
    anchorServiceDate: args.inputContext.anchor.anchorServiceDate,
    anchorOdometerKm: args.inputContext.anchor.anchorOdometerKm,
    anchorValidationStatus: args.inputContext.anchor.anchorValidationStatus,
    calibrationCount: args.inputContext.anchor.calibrationCount,
    frontPadAnchorMm: args.inputContext.anchor.frontPadAnchorMm,
    rearPadAnchorMm: args.inputContext.anchor.rearPadAnchorMm,
    frontDiscAnchorMm: args.inputContext.anchor.frontDiscAnchorMm,
    rearDiscAnchorMm: args.inputContext.anchor.rearDiscAnchorMm,
    evidenceIds,
    prediction: args.predictionPayload,
    modelVersion: args.predictionPayload.modelVersion,
    modelConfigHash: args.predictionPayload.modelConfigHash,
    predictionGeneratedAt: args.predictionPayload.predictionGeneratedAt,
  };
}

export function buildSnapshotRemainingRange(args: {
  frontPadRemainingKm: number | null;
  rearPadRemainingKm: number | null;
  frontDiscRemainingKm: number | null;
  rearDiscRemainingKm: number | null;
  confidenceLabel: string;
  gapAssessment: BrakeCoverageGapAssessment;
}): BrakeSnapshotRemainingRange {
  const confidence = args.confidenceLabel.toUpperCase() as BrakeConfidenceLevel;
  const spread = args.gapAssessment.remainingKmSpreadMultiplier;
  const frontPad = buildRemainingKmRange(args.frontPadRemainingKm, confidence, spread);
  const rearPad = buildRemainingKmRange(args.rearPadRemainingKm, confidence, spread);
  const frontDisc = buildRemainingKmRange(args.frontDiscRemainingKm, confidence, spread);
  const rearDisc = buildRemainingKmRange(args.rearDiscRemainingKm, confidence, spread);
  const frontRemaining = minNullable(args.frontPadRemainingKm, args.frontDiscRemainingKm);
  const rearRemaining = minNullable(args.rearPadRemainingKm, args.rearDiscRemainingKm);
  const padsRemaining = minNullable(args.frontPadRemainingKm, args.rearPadRemainingKm);
  const discsRemaining = minNullable(args.frontDiscRemainingKm, args.rearDiscRemainingKm);

  return {
    pads: buildRemainingKmRange(padsRemaining, confidence, spread),
    discs: buildRemainingKmRange(discsRemaining, confidence, spread),
    front: buildRemainingKmRange(frontRemaining, confidence, spread),
    rear: buildRemainingKmRange(rearRemaining, confidence, spread),
  };
}

export function deriveSnapshotCondition(args: {
  frontPadHealthPct: number | null;
  rearPadHealthPct: number | null;
  frontDiscHealthPct: number | null;
  rearDiscHealthPct: number | null;
  frontPadRemainingKm: number | null;
  rearPadRemainingKm: number | null;
  frontDiscRemainingKm: number | null;
  rearDiscRemainingKm: number | null;
}): BrakeCondition {
  const frontCond = aggregateBrakeCondition(
    classifyEstimatedCondition(args.frontPadHealthPct, args.frontPadRemainingKm),
    classifyEstimatedCondition(args.frontDiscHealthPct, args.frontDiscRemainingKm),
  );
  const rearCond = aggregateBrakeCondition(
    classifyEstimatedCondition(args.rearPadHealthPct, args.rearPadRemainingKm),
    classifyEstimatedCondition(args.rearDiscHealthPct, args.rearDiscRemainingKm),
  );
  return aggregateBrakeCondition(frontCond, rearCond);
}

export function buildSnapshotConfidence(args: {
  score: number;
  label: string;
  dataBasis?: 'MEASURED' | 'DOCUMENTED' | 'ESTIMATED';
}): BrakeSnapshotConfidence {
  const level = classifyConfidenceLevel({
    score: args.score,
    dataBasis: args.dataBasis ?? 'ESTIMATED',
  });
  return {
    score: Math.round(args.score),
    label: level,
  };
}

export function serializeAlertsSummary(
  alerts: ReadonlyArray<BrakeSnapshotAlertSummary>,
): BrakeSnapshotAlertSummary[] {
  return alerts.map((alert) => ({
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    value: alert.value ?? null,
  }));
}

export function buildBrakeSnapshotPredictionPayload(args: {
  modelVersion: string;
  modelConfigHash: string;
  predictionGeneratedAt: Date;
  frontPadEstimateMm: number | null;
  rearPadEstimateMm: number | null;
  frontDiscEstimateMm: number | null;
  rearDiscEstimateMm: number | null;
}): BrakeSnapshotPredictionPayload {
  return buildSnapshotPredictionPayload(args);
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

import {
  HV_PAIRWISE_SNAPSHOT_CADENCE_MS,
  isLegacyHvPairwiseCapacityAssessmentEnabled,
} from '../../../config/battery-health-v2.config';

export const LEGACY_HV_CAPACITY_DISPLAY_MODE = 'LEGACY_UNVERIFIED' as const;

export const LEGACY_HV_PAIRWISE_CAPACITY_METHODS = [
  'capacity_measurement',
  'energy_throughput',
] as const;

export type LegacyHvPairwiseCapacityMethod =
  (typeof LEGACY_HV_PAIRWISE_CAPACITY_METHODS)[number];

export interface LegacyHvCapacityFeatures {
  estimatedCapacityKwh?: number | null;
  sohPercent?: number | null;
  publicationMethod?: string | null;
  publishedSohPct?: number | null;
}

export interface LegacyHvCapacityPresentation {
  displayMode: typeof LEGACY_HV_CAPACITY_DISPLAY_MODE | 'DECISION_CAPABLE';
  decisionCapable: boolean;
  diagnosticLabelDe: string;
  measurementMethod: string | null;
  snapshotCadenceMs: number;
  diagnosticEstimatedCapacityKwh: number | null;
  diagnosticSohPercent: number | null;
  operationalEstimatedCapacityKwh: number | null;
  operationalSohPercent: number | null;
}

export function isLegacyHvPairwiseCapacityMethod(
  method: string | null | undefined,
): method is LegacyHvPairwiseCapacityMethod {
  if (!method) return false;
  return (LEGACY_HV_PAIRWISE_CAPACITY_METHODS as readonly string[]).includes(method);
}

export function effectiveHvPublishedSohForDecisions(
  method: string | null | undefined,
  publishedSohPct: number | null | undefined,
): number | null {
  if (publishedSohPct == null || !Number.isFinite(publishedSohPct)) return null;
  if (isLegacyHvPairwiseCapacityMethod(method) && !isLegacyHvPairwiseCapacityAssessmentEnabled()) {
    return null;
  }
  return publishedSohPct;
}

export function effectiveHvMeasuredSohForDecisions(
  method: string | null | undefined,
  sohPercent: number | null | undefined,
): number | null {
  if (sohPercent == null || !Number.isFinite(sohPercent)) return null;
  if (!isLegacyHvPairwiseCapacityMethod(method)) return null;
  if (!isLegacyHvPairwiseCapacityAssessmentEnabled()) return null;
  return sohPercent;
}

export function presentLegacyHvCapacity(
  features: LegacyHvCapacityFeatures | null | undefined,
): LegacyHvCapacityPresentation {
  const diagnosticCapacity = features?.estimatedCapacityKwh ?? null;
  const diagnosticSoh = features?.sohPercent ?? null;
  const method = features?.publicationMethod ?? null;
  const publishedSoh = features?.publishedSohPct ?? null;
  const legacyPairwise = isLegacyHvPairwiseCapacityMethod(method);
  const decisionCapable =
    isLegacyHvPairwiseCapacityAssessmentEnabled() &&
    legacyPairwise &&
    (diagnosticCapacity != null || publishedSoh != null);

  return {
    displayMode: decisionCapable ? 'DECISION_CAPABLE' : LEGACY_HV_CAPACITY_DISPLAY_MODE,
    decisionCapable,
    diagnosticLabelDe: decisionCapable
      ? 'HV-Kapazitätsschätzung (Legacy-Bewertung aktiv)'
      : 'Legacy HV-Kapazität / unverifiziert (nicht entscheidungsfähig)',
    measurementMethod: method,
    snapshotCadenceMs: HV_PAIRWISE_SNAPSHOT_CADENCE_MS,
    diagnosticEstimatedCapacityKwh: diagnosticCapacity,
    diagnosticSohPercent: diagnosticSoh ?? publishedSoh,
    operationalEstimatedCapacityKwh: decisionCapable ? diagnosticCapacity : null,
    operationalSohPercent: decisionCapable ? (publishedSoh ?? diagnosticSoh) : null,
  };
}

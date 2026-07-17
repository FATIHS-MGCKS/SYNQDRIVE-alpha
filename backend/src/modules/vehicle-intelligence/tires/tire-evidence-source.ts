/**
 * Canonical tire evidence source taxonomy (mirrors Prisma enum TireEvidenceSource).
 *
 * Used for provenance on setups, measurements, wear data points, and snapshots.
 * Legacy string `source` fields are NOT auto-mapped in migrations — use
 * {@link mapLegacyMeasurementSourceToEvidence} at write time only.
 */

import { TireEvidenceSource } from '@prisma/client';

export { TireEvidenceSource };

/** Evidence sources that may anchor ground-truth validation (wear regression). */
export const GROUND_TRUTH_EVIDENCE_SOURCES: ReadonlySet<TireEvidenceSource> = new Set([
  TireEvidenceSource.MANUAL_MEASUREMENT,
  TireEvidenceSource.WORKSHOP_MEASUREMENT,
  TireEvidenceSource.DOCUMENT_MEASUREMENT,
  TireEvidenceSource.MANUFACTURER_CONFIRMED,
  TireEvidenceSource.USER_CONFIRMED,
]);

/** Sources that are estimates or assumptions — never ground truth. */
export const NON_GROUND_TRUTH_EVIDENCE_SOURCES: ReadonlySet<TireEvidenceSource> = new Set([
  TireEvidenceSource.AI_ESTIMATED,
  TireEvidenceSource.MODEL_ESTIMATED,
  TireEvidenceSource.DEFAULT_ASSUMPTION,
  TireEvidenceSource.PROVIDER_SIGNAL,
  TireEvidenceSource.UNKNOWN,
]);

export function isGroundTruthEvidenceSource(
  source: TireEvidenceSource | null | undefined,
): boolean {
  return source != null && GROUND_TRUTH_EVIDENCE_SOURCES.has(source);
}

/**
 * Maps legacy VehicleTireTreadMeasurement.source strings to TireEvidenceSource.
 * Returns null when the legacy value is unknown — caller must not guess.
 */
export function mapLegacyMeasurementSourceToEvidence(
  legacySource: string | null | undefined,
): TireEvidenceSource | null {
  if (!legacySource) return null;
  const normalized = legacySource.trim().toLowerCase();

  switch (normalized) {
    case 'manual':
    case 'calibration':
      return TireEvidenceSource.MANUAL_MEASUREMENT;
    case 'workshop':
      return TireEvidenceSource.WORKSHOP_MEASUREMENT;
    case 'manual_registration':
    case 'documented_registration':
    case 'registration':
      return TireEvidenceSource.DOCUMENT_MEASUREMENT;
    case 'ai_confirmed':
      return TireEvidenceSource.USER_CONFIRMED;
    case 'ai_estimate':
    case 'ai_agent':
      return TireEvidenceSource.AI_ESTIMATED;
    default:
      return null;
  }
}

export const TIRE_EVIDENCE_SOURCE_VALUES: TireEvidenceSource[] = [
  TireEvidenceSource.MANUAL_MEASUREMENT,
  TireEvidenceSource.WORKSHOP_MEASUREMENT,
  TireEvidenceSource.DOCUMENT_MEASUREMENT,
  TireEvidenceSource.MANUFACTURER_CONFIRMED,
  TireEvidenceSource.USER_CONFIRMED,
  TireEvidenceSource.AI_ESTIMATED,
  TireEvidenceSource.MODEL_ESTIMATED,
  TireEvidenceSource.DEFAULT_ASSUMPTION,
  TireEvidenceSource.PROVIDER_SIGNAL,
  TireEvidenceSource.UNKNOWN,
];

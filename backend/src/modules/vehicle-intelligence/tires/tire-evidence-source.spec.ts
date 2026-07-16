import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import {
  GROUND_TRUTH_EVIDENCE_SOURCES,
  NON_GROUND_TRUTH_EVIDENCE_SOURCES,
  TIRE_EVIDENCE_SOURCE_VALUES,
  isGroundTruthEvidenceSource,
  mapLegacyMeasurementSourceToEvidence,
} from './tire-evidence-source';

describe('tire-evidence-source', () => {
  it('defines all canonical evidence source enum values', () => {
    expect(TIRE_EVIDENCE_SOURCE_VALUES).toHaveLength(10);
    expect(TIRE_EVIDENCE_SOURCE_VALUES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('partitions ground truth vs non-ground-truth without overlap', () => {
    for (const source of GROUND_TRUTH_EVIDENCE_SOURCES) {
      expect(NON_GROUND_TRUTH_EVIDENCE_SOURCES.has(source)).toBe(false);
      expect(isGroundTruthEvidenceSource(source)).toBe(true);
    }
    for (const source of NON_GROUND_TRUTH_EVIDENCE_SOURCES) {
      expect(GROUND_TRUTH_EVIDENCE_SOURCES.has(source)).toBe(false);
      expect(isGroundTruthEvidenceSource(source)).toBe(false);
    }
  });

  it('never classifies DEFAULT_ASSUMPTION or MODEL_ESTIMATED as ground truth', () => {
    expect(isGroundTruthEvidenceSource(TireEvidenceSource.DEFAULT_ASSUMPTION)).toBe(false);
    expect(isGroundTruthEvidenceSource(TireEvidenceSource.MODEL_ESTIMATED)).toBe(false);
    expect(isGroundTruthEvidenceSource(TireEvidenceSource.AI_ESTIMATED)).toBe(false);
  });

  it('maps known legacy measurement sources without guessing unknown values', () => {
    expect(mapLegacyMeasurementSourceToEvidence('manual')).toBe(
      TireEvidenceSource.MANUAL_MEASUREMENT,
    );
    expect(mapLegacyMeasurementSourceToEvidence('workshop')).toBe(
      TireEvidenceSource.WORKSHOP_MEASUREMENT,
    );
    expect(mapLegacyMeasurementSourceToEvidence('manual_registration')).toBe(
      TireEvidenceSource.DOCUMENT_MEASUREMENT,
    );
    expect(mapLegacyMeasurementSourceToEvidence('ai_confirmed')).toBe(
      TireEvidenceSource.USER_CONFIRMED,
    );
    expect(mapLegacyMeasurementSourceToEvidence('totally_unknown')).toBeNull();
    expect(mapLegacyMeasurementSourceToEvidence(null)).toBeNull();
  });
});

describe('tire schema enums (Prisma client contract)', () => {
  it('defines TireBaselineStatus lifecycle values', () => {
    expect(Object.values(TireBaselineStatus)).toEqual(
      expect.arrayContaining([
        'UNKNOWN',
        'INCOMPLETE',
        'ESTIMATED',
        'CONFIRMED',
        'DOCUMENTED',
      ]),
    );
  });
});

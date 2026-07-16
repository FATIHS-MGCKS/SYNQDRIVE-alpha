import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import {
  buildSetupBaselineProvenance,
  buildSnapshotProvenance,
  buildWearDataPointProvenance,
} from './tire-provenance.repository';

describe('tire-provenance.repository', () => {
  const measuredAt = new Date('2026-06-01T10:00:00Z');
  const predictionAt = new Date('2026-07-16T12:00:00Z');

  describe('buildWearDataPointProvenance', () => {
    it('marks ground truth when evidence source is manual measurement', () => {
      const fields = buildWearDataPointProvenance({
        predictedTreadMm: 6.5,
        actualTreadMm: 7.0,
        measurementId: 'meas-1',
        measurementSource: 'manual',
        measuredAt,
        predictionGeneratedAt: predictionAt,
        modelVersion: 'TIRE_HEALTH_V2',
        modelConfigHash: 'abc123',
        predictionSnapshotId: 'snap-1',
      });

      expect(fields.isGroundTruth).toBe(true);
      expect(fields.actualSource).toBe(TireEvidenceSource.MANUAL_MEASUREMENT);
      expect(fields.actualMeasurementId).toBe('meas-1');
      expect(fields.actualMeasuredAt).toEqual(measuredAt);
      expect(fields.predictionGeneratedAt).toEqual(predictionAt);
      expect(fields.modelVersion).toBe('TIRE_HEALTH_V2');
      expect(fields.predictionSnapshotId).toBe('snap-1');
    });

    it('does not mark ground truth for unknown legacy source', () => {
      const fields = buildWearDataPointProvenance({
        predictedTreadMm: 6.5,
        actualTreadMm: 7.0,
        measurementId: 'meas-2',
        measurementSource: 'opaque_legacy',
        measuredAt,
        predictionGeneratedAt: predictionAt,
      });

      expect(fields.isGroundTruth).toBe(false);
      expect(fields.actualSource).toBeNull();
    });

    it('respects explicit non-ground-truth evidence source', () => {
      const fields = buildWearDataPointProvenance({
        predictedTreadMm: 6.5,
        actualTreadMm: 7.0,
        measurementId: 'meas-3',
        measurementSource: 'manual',
        evidenceSource: TireEvidenceSource.MODEL_ESTIMATED,
        measuredAt,
        predictionGeneratedAt: predictionAt,
      });

      expect(fields.isGroundTruth).toBe(false);
      expect(fields.actualSource).toBe(TireEvidenceSource.MODEL_ESTIMATED);
    });
  });

  describe('buildSnapshotProvenance', () => {
    it('returns nullable snapshot metadata without defaults', () => {
      const fields = buildSnapshotProvenance({});

      expect(fields.modelVersion).toBeNull();
      expect(fields.baselineSource).toBeNull();
      expect(fields.evidenceSummary).toBeNull();
    });

    it('passes through model version and evidence summary', () => {
      const fields = buildSnapshotProvenance({
        modelVersion: 'TIRE_HEALTH_V2',
        modelConfigHash: 'hash-1',
        inputFingerprint: 'fp-1',
        baselineSource: TireEvidenceSource.MODEL_ESTIMATED,
        evidenceSummary: { displayMode: 'ESTIMATED' },
      });

      expect(fields.modelVersion).toBe('TIRE_HEALTH_V2');
      expect(fields.baselineSource).toBe(TireEvidenceSource.MODEL_ESTIMATED);
      expect(fields.evidenceSummary).toEqual({ displayMode: 'ESTIMATED' });
    });
  });

  describe('buildSetupBaselineProvenance', () => {
    it('does not invent baseline status for empty input', () => {
      const fields = buildSetupBaselineProvenance({});
      expect(fields.baselineStatus).toBeNull();
      expect(fields.initialTreadEvidenceSource).toBeNull();
    });

    it('stores confirmed baseline when explicitly provided', () => {
      const fields = buildSetupBaselineProvenance({
        evidenceSource: TireEvidenceSource.DOCUMENT_MEASUREMENT,
        measuredAt,
        confirmedAt: predictionAt,
        evidenceId: 'meas-doc-1',
        baselineConfidence: 0.85,
        baselineStatus: TireBaselineStatus.CONFIRMED,
      });

      expect(fields.baselineStatus).toBe(TireBaselineStatus.CONFIRMED);
      expect(fields.initialTreadEvidenceId).toBe('meas-doc-1');
    });
  });
});

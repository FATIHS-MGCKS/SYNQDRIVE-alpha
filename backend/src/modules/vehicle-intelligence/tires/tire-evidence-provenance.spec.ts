import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import {
  buildSetupBaselineFields,
  buildSnapshotEvidenceSummary,
  deriveBaselineConfidence,
  isConfirmedEvidence,
  isDefaultTreadFallbackValue,
  isMeasuredEvidence,
  resolveEvidenceFromLegacySource,
  resolveInitialTreadEvidence,
  resolveWheelTreadMm,
} from './tire-evidence-provenance';
import { TIRE_HEALTH_CONFIG } from './tire-health.config';
import { buildPersistedAiTireSpec, normalizeAiTireSpecResult } from './ai-tire-spec-normalizer';

describe('tire-evidence-provenance helpers', () => {
  it('classifies measured vs confirmed evidence', () => {
    expect(isMeasuredEvidence(TireEvidenceSource.MANUAL_MEASUREMENT)).toBe(true);
    expect(isMeasuredEvidence(TireEvidenceSource.WORKSHOP_MEASUREMENT)).toBe(true);
    expect(isMeasuredEvidence(TireEvidenceSource.DEFAULT_ASSUMPTION)).toBe(false);
    expect(isConfirmedEvidence(TireEvidenceSource.USER_CONFIRMED)).toBe(true);
    expect(isConfirmedEvidence(TireEvidenceSource.AI_ESTIMATED)).toBe(false);
  });

  it('keeps DEFAULT_ASSUMPTION baseline confidence low', () => {
    expect(deriveBaselineConfidence(TireEvidenceSource.DEFAULT_ASSUMPTION)).toBeLessThanOrEqual(20);
    expect(deriveBaselineConfidence(TireEvidenceSource.MANUAL_MEASUREMENT)).toBeGreaterThan(80);
  });

  it('detects configured 8 mm fallback value', () => {
    expect(isDefaultTreadFallbackValue(TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm)).toBe(true);
    expect(isDefaultTreadFallbackValue(7.5)).toBe(false);
  });

  it('resolves 8 mm fallback as DEFAULT_ASSUMPTION without measurement id', () => {
    const resolved = resolveInitialTreadEvidence({
      usedDefaultFallback: true,
      treadMm: TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm,
    });

    expect(resolved.evidenceSource).toBe(TireEvidenceSource.DEFAULT_ASSUMPTION);
    expect(resolved.baselineStatus).toBe(TireBaselineStatus.INCOMPLETE);
    expect(resolved.baselineConfidence).toBeLessThanOrEqual(20);
    expect(resolved.evidenceId).toBeNull();
    expect(resolved.usedDefaultFallback).toBe(true);
  });

  it('resolves real manual measurement evidence', () => {
    const resolved = resolveInitialTreadEvidence({
      treadMm: 6.8,
      legacySource: 'manual',
      measuredAt: new Date('2026-06-01'),
      evidenceId: 'meas-1',
    });

    expect(resolved.evidenceSource).toBe(TireEvidenceSource.MANUAL_MEASUREMENT);
    expect(resolved.evidenceId).toBe('meas-1');
    expect(isMeasuredEvidence(resolved.evidenceSource)).toBe(true);
  });

  it('resolves AI spec without user confirmation as AI_ESTIMATED', () => {
    const resolved = resolveInitialTreadEvidence({
      aiTireSpec: { newTreadDepthMm: 8.2, confidenceScore: 72, userConfirmedSpec: false },
    });

    expect(resolved.evidenceSource).toBe(TireEvidenceSource.AI_ESTIMATED);
    expect(deriveBaselineConfidence(resolved.evidenceSource, { aiConfidenceScore: 72 })).toBeLessThan(70);
  });

  it('promotes AI spec with user confirmation to USER_CONFIRMED', () => {
    const resolved = resolveInitialTreadEvidence({
      aiTireSpec: { newTreadDepthMm: 8.2, confidenceScore: 72, userConfirmedSpec: true },
      userConfirmedSpec: true,
      treadMm: 8.2,
      confirmedAt: new Date('2026-06-02'),
    });

    expect(resolved.evidenceSource).toBe(TireEvidenceSource.USER_CONFIRMED);
    expect(isConfirmedEvidence(resolved.evidenceSource)).toBe(true);
    expect(deriveBaselineConfidence(resolved.evidenceSource, { userConfirmedSpec: true })).toBeGreaterThan(75);
  });

  it('maps document / registration sources to DOCUMENT_MEASUREMENT', () => {
    expect(resolveEvidenceFromLegacySource('manual_registration')).toBe(
      TireEvidenceSource.DOCUMENT_MEASUREMENT,
    );
    expect(
      resolveEvidenceFromLegacySource('manual', { linkedDocumentUrl: 'https://example.com/doc.pdf' }),
    ).toBe(TireEvidenceSource.DOCUMENT_MEASUREMENT);
  });

  it('resolves stored-set tread values as USER_CONFIRMED baseline', () => {
    const fields = buildSetupBaselineFields({
      setupInitialTreadFrontMm: 7.1,
      setupInitialTreadRearMm: 7.0,
      setupInitialTreadDepthMm: 7.05,
    });

    expect(fields.initialTreadEvidenceSource).toBe(TireEvidenceSource.USER_CONFIRMED);
    expect(fields.baselineStatus).toBe(TireBaselineStatus.CONFIRMED);
  });

  it('resolves tire replacement install evidence', () => {
    const resolved = resolveInitialTreadEvidence({
      treadMm: 8.0,
      legacySource: 'replacement',
      workshopName: 'Werkstatt Nord',
      measuredAt: new Date('2026-06-03'),
    });

    expect(resolved.evidenceSource).toBe(TireEvidenceSource.WORKSHOP_MEASUREMENT);
  });

  it('marks partial wheel coverage as incomplete baseline', () => {
    const resolved = resolveInitialTreadEvidence({
      treadByPosition: { FL: 6.5, FR: 6.4 },
      legacySource: 'manual',
      measuredAt: new Date('2026-06-04'),
      evidenceId: 'meas-partial',
    });

    expect(resolved.baselineStatus).toBe(TireBaselineStatus.INCOMPLETE);
    expect(resolved.baselineConfidence).toBeLessThan(90);
  });

  it('builds snapshot provenance without treating default as measured', () => {
    const summary = buildSnapshotEvidenceSummary({
      currentTreadMm: 8,
      treadSource: 'fallback_estimate',
      baselineSource: TireEvidenceSource.DEFAULT_ASSUMPTION,
      lastMeasurementAt: null,
    });

    expect(summary.currentTreadSource).toBe(TireEvidenceSource.DEFAULT_ASSUMPTION);
    expect(summary.isDefaultAssumption).toBe(true);
    expect(summary.isMeasured).toBe(false);
    expect(summary.isEstimated).toBe(true);
    expect(summary.lastActualMeasurementAt).toBeNull();
  });

  it('does not auto-confirm persisted AI specs without explicit user confirmation', () => {
    const normalized = normalizeAiTireSpecResult({
      matchedBrand: 'Michelin',
      newTreadDepthMm: 8.2,
      confidenceScore: 66,
    });
    const persisted = buildPersistedAiTireSpec(normalized, {
      jobId: 'job-1',
      confidenceScore: 66,
      completedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(persisted.userConfirmedSpec).toBe(false);
  });
});

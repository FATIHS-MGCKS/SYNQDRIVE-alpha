import { SohPublicationState } from '@prisma/client';
import {
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import {
  evaluateLegacyPublicationSafety,
  effectiveLvEstimatedHealthStatusForDecisions,
  hasMislabeledLvSohPercentEvidence,
  LV_REST_CONTAMINATION_THRESHOLD_V,
} from './battery-legacy-publication-safety';

const safeBase = {
  publicationState: SohPublicationState.STABLE,
  publishedSohPct: 82,
  maturityConfidence: 'high',
  vOff60m: 12.65,
  vOff6h: 12.62,
  rest60mCapturedAt: new Date('2026-07-15T08:00:00.000Z'),
  rest6hCapturedAt: new Date('2026-07-15T14:00:00.000Z'),
  crankDrop: 1.2,
  crankObservationCount: 3,
  crankAt: new Date('2026-07-15T07:55:00.000Z'),
  scoredAt: new Date('2026-07-15T14:05:00.000Z'),
  lastPublishedAt: new Date('2026-07-15T14:05:00.000Z'),
  batteryTypeRaw: 'AGM',
  lvEvidenceRecent: [],
};

describe('battery-legacy-publication-safety', () => {
  it('marks a clean legacy publication as decision-capable', () => {
    const result = evaluateLegacyPublicationSafety(safeBase);
    expect(result.decisionCapable).toBe(true);
    expect(result.displayMode).toBe('DECISION_CAPABLE');
    expect(result.reasons).toHaveLength(0);
  });

  it('disqualifies when measurement quality is unknown', () => {
    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      maturityConfidence: 'none',
    });
    expect(result.decisionCapable).toBe(false);
    expect(result.reasons).toContain('MEASUREMENT_QUALITY_UNKNOWN');
  });

  it('disqualifies contaminated REST above 13.2 V', () => {
    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      vOff60m: 14.43,
    });
    expect(result.decisionCapable).toBe(false);
    expect(result.reasons).toContain('REST_LIKELY_CONTAMINATED');
  });

  it('disqualifies unreliable crank path with observations but no drop', () => {
    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      crankObservationCount: 5,
      crankDrop: null,
    });
    expect(result.decisionCapable).toBe(false);
    expect(result.reasons).toContain('CRANK_PATH_UNRELIABLE');
  });

  it('disqualifies unknown or lithium chemistry', () => {
    const unknown = evaluateLegacyPublicationSafety({
      ...safeBase,
      batteryTypeRaw: null,
    });
    expect(unknown.decisionCapable).toBe(false);
    expect(unknown.reasons).toContain('CHEMISTRY_UNKNOWN_OR_UNSUPPORTED');

    const lithium = evaluateLegacyPublicationSafety({
      ...safeBase,
      batteryTypeRaw: 'Lithium',
    });
    expect(lithium.decisionCapable).toBe(false);
    expect(lithium.reasons).toContain('CHEMISTRY_UNKNOWN_OR_UNSUPPORTED');
  });

  it('disqualifies temporally incompatible rest/crank evidence', () => {
    const sameTs = evaluateLegacyPublicationSafety({
      ...safeBase,
      rest60mCapturedAt: new Date('2026-07-15T08:00:00.000Z'),
      rest6hCapturedAt: new Date('2026-07-15T08:00:00.000Z'),
    });
    expect(sameTs.decisionCapable).toBe(false);
    expect(sameTs.reasons).toContain('TEMPORALLY_INCOMPATIBLE_EVIDENCE');

    const staleCrank = evaluateLegacyPublicationSafety({
      ...safeBase,
      crankAt: new Date('2026-06-01T08:00:00.000Z'),
    });
    expect(staleCrank.decisionCapable).toBe(false);
    expect(staleCrank.reasons).toContain('TEMPORALLY_INCOMPATIBLE_EVIDENCE');
  });

  it('disqualifies mislabeled LV SOH_PERCENT telemetry/model evidence', () => {
    expect(
      hasMislabeledLvSohPercentEvidence([
        {
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        },
      ]),
    ).toBe(true);

    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      lvEvidenceRecent: [
        {
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        },
      ],
    });
    expect(result.decisionCapable).toBe(false);
    expect(result.reasons).toContain('SEMANTICALLY_MISLABELED_SOH');
  });

  it('allows mislabeled evidence when workshop SOH is confirmed', () => {
    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      lvEvidenceRecent: [
        {
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        },
        {
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        },
      ],
    });
    expect(result.decisionCapable).toBe(true);
    expect(result.reasons).not.toContain('SEMANTICALLY_MISLABELED_SOH');
  });

  it('disqualifies incomplete provenance', () => {
    const result = evaluateLegacyPublicationSafety({
      ...safeBase,
      lastPublishedAt: null,
    });
    expect(result.decisionCapable).toBe(false);
    expect(result.reasons).toContain('INCOMPLETE_PROVENANCE');
  });

  it('effectiveLvEstimatedHealthStatusForDecisions returns UNKNOWN when unsafe', () => {
    const safety = evaluateLegacyPublicationSafety({
      ...safeBase,
      vOff60m: LV_REST_CONTAMINATION_THRESHOLD_V + 0.5,
    });
    expect(
      effectiveLvEstimatedHealthStatusForDecisions('CRITICAL', safety),
    ).toBe('UNKNOWN');
  });

  it('effectiveLvEstimatedHealthStatusForDecisions preserves status when safe', () => {
    const safety = evaluateLegacyPublicationSafety(safeBase);
    expect(
      effectiveLvEstimatedHealthStatusForDecisions('WARNING', safety),
    ).toBe('WARNING');
  });
});

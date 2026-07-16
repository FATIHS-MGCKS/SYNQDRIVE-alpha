import {
  BatteryChemistry,
  BatteryMeasurementQuality,
} from '../battery-health/battery-v2-domain';
import {
  isLeadAcidCurveApplicable,
  policyMayUseAgmLikeThresholds,
  resolveFromConfirmedBatterySpec,
  resolveFromVerifiedManual,
  resolveFromWorkshopDocumentEvidence,
  resolveLvBatteryChemistry,
} from './lv-battery-chemistry-resolver';
import { LvBatteryChemistrySource } from './lv-battery-chemistry-resolver.types';

describe('resolveLvBatteryChemistry', () => {
  it('resolves AGM from confirmed battery spec', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'AGM',
          batteryVolt: 12,
          sourceType: 'MANUAL',
          sourceConfidence: 0.9,
          updatedAt: '2026-07-01T10:00:00.000Z',
        },
      ],
    });

    expect(result.chemistry).toBe(BatteryChemistry.AGM);
    expect(result.source).toBe(LvBatteryChemistrySource.BATTERY_SPEC);
    expect(result.confidence).toBe('HIGH');
    expect(result.verifiedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('resolves LEAD_ACID from confirmed spec', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'Lead-Acid',
          batteryVolt: 12,
          sourceType: 'VIN_DECODE',
          sourceConfidence: 0.8,
        },
      ],
    });
    expect(result.chemistry).toBe(BatteryChemistry.LEAD_ACID);
  });

  it('resolves EFB distinctly and does not collapse to AGM', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'EFB',
          batteryVolt: 12,
          sourceType: 'MANUAL',
          sourceConfidence: 0.85,
        },
      ],
    });
    expect(result.chemistry).toBe(BatteryChemistry.EFB);
    expect(result.chemistry).not.toBe(BatteryChemistry.AGM);
  });

  it('resolves LITHIUM from confirmed spec', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'Lithium',
          batteryVolt: 12.8,
          sourceType: 'MANUAL',
          sourceConfidence: 1,
        },
      ],
    });
    expect(result.chemistry).toBe(BatteryChemistry.LITHIUM);
  });

  it('uses workshop evidence when spec is not confirmed', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'AGM',
          sourceType: 'ENRICHMENT',
          sourceConfidence: 0.2,
        },
      ],
      workshopDocumentEvidence: [
        {
          sourceType: 'WORKSHOP_MEASUREMENT',
          observedAt: '2026-06-15T08:00:00.000Z',
          chemistryRaw: 'EFB',
        },
      ],
    });

    expect(result.chemistry).toBe(BatteryChemistry.EFB);
    expect(result.source).toBe(LvBatteryChemistrySource.WORKSHOP_DOCUMENT);
  });

  it('uses document-confirmed evidence before verified manual', () => {
    const result = resolveLvBatteryChemistry({
      workshopDocumentEvidence: [
        {
          sourceType: 'DOCUMENT_CONFIRMED',
          observedAt: '2026-06-20T12:00:00.000Z',
          metadataJson: { batteryType: 'AGM' },
        },
      ],
      verifiedManual: {
        batteryType: 'LEAD_ACID',
        sourceType: 'MANUAL',
        verifiedAt: '2026-06-10T12:00:00.000Z',
      },
    });

    expect(result.chemistry).toBe(BatteryChemistry.AGM);
    expect(result.source).toBe(LvBatteryChemistrySource.WORKSHOP_DOCUMENT);
  });

  it('falls back to verified manual entry', () => {
    const result = resolveLvBatteryChemistry({
      verifiedManual: {
        batteryType: 'AGM',
        sourceType: 'MANUAL',
        verifiedAt: '2026-06-10T12:00:00.000Z',
      },
    });

    expect(result.chemistry).toBe(BatteryChemistry.AGM);
    expect(result.source).toBe(LvBatteryChemistrySource.MANUAL_VERIFIED);
    expect(result.verifiedAt).toBe('2026-06-10T12:00:00.000Z');
  });

  it('returns UNKNOWN for incomplete data', () => {
    const result = resolveLvBatteryChemistry({
      specs: [{ batteryType: null, sourceType: 'ENRICHMENT', sourceConfidence: 0.1 }],
    });
    expect(result.chemistry).toBe(BatteryChemistry.UNKNOWN);
    expect(result.source).toBe(LvBatteryChemistrySource.UNKNOWN);
  });

  it('returns UNKNOWN on confirmed spec vs workshop conflict', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: 'AGM',
          batteryVolt: 12,
          sourceType: 'MANUAL',
          sourceConfidence: 0.95,
        },
      ],
      workshopDocumentEvidence: [
        {
          sourceType: 'DOCUMENT_CONFIRMED',
          observedAt: '2026-06-20T12:00:00.000Z',
          chemistryRaw: 'EFB',
        },
      ],
    });

    expect(result.chemistry).toBe(BatteryChemistry.UNKNOWN);
    expect(result.evidence).toContain('conflict:spec_vs_workshop_document');
  });

  it('does not infer chemistry from voltage-only input', () => {
    const result = resolveLvBatteryChemistry({
      specs: [
        {
          batteryType: null,
          batteryVolt: 12.6,
          sourceType: 'ENRICHMENT',
          sourceConfidence: 0.3,
        },
      ],
    });
    expect(result.chemistry).toBe(BatteryChemistry.UNKNOWN);
  });
});

describe('layer resolvers', () => {
  it('resolveFromWorkshopDocumentEvidence picks newest known chemistry', () => {
    const layer = resolveFromWorkshopDocumentEvidence([
      {
        sourceType: 'WORKSHOP_MEASUREMENT',
        observedAt: '2026-01-01T00:00:00.000Z',
        chemistryRaw: 'LEAD_ACID',
      },
      {
        sourceType: 'DOCUMENT_CONFIRMED',
        observedAt: '2026-06-01T00:00:00.000Z',
        chemistryRaw: 'AGM',
      },
    ]);
    expect(layer.chemistry).toBe(BatteryChemistry.AGM);
  });

  it('resolveFromVerifiedManual uses MANUAL_REPORT evidence', () => {
    const layer = resolveFromVerifiedManual({
      evidence: [
        {
          sourceType: 'MANUAL_REPORT',
          observedAt: '2026-05-01T00:00:00.000Z',
          metadataJson: { chemistry: 'EFB' },
        },
      ],
    });
    expect(layer.chemistry).toBe(BatteryChemistry.EFB);
  });

  it('resolveFromConfirmedBatterySpec ignores low-confidence enrichment', () => {
    const layer = resolveFromConfirmedBatterySpec([
      {
        batteryType: 'AGM',
        sourceType: 'ENRICHMENT',
        sourceConfidence: 0.1,
      },
    ]);
    expect(layer.chemistry).toBe(BatteryChemistry.UNKNOWN);
  });
});

describe('chemistry policy helpers', () => {
  it('allows lead-acid curves only for LA chemistries', () => {
    expect(isLeadAcidCurveApplicable(BatteryChemistry.AGM)).toBe(true);
    expect(isLeadAcidCurveApplicable(BatteryChemistry.EFB)).toBe(true);
    expect(isLeadAcidCurveApplicable(BatteryChemistry.LITHIUM)).toBe(false);
    expect(isLeadAcidCurveApplicable(BatteryChemistry.UNKNOWN)).toBe(false);
  });

  it('permits AGM-like policy thresholds for AGM and EFB only', () => {
    expect(policyMayUseAgmLikeThresholds(BatteryChemistry.AGM)).toBe(true);
    expect(policyMayUseAgmLikeThresholds(BatteryChemistry.EFB)).toBe(true);
    expect(policyMayUseAgmLikeThresholds(BatteryChemistry.LEAD_ACID)).toBe(false);
  });

  it('does not treat measurement quality as chemistry inference', () => {
    expect(BatteryMeasurementQuality.UNSUPPORTED_PROFILE).toBeDefined();
  });
});

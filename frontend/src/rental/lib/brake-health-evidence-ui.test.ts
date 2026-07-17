import { describe, expect, it } from 'vitest';
import type { BrakeEvidencePresentation, BrakeHealthSummary } from '../../lib/api';
import {
  brakeActiveDataQuality,
  brakeActiveSafety,
  brakeComponentLines,
  brakeOverviewLabel,
  brakeRemainingKmLabel,
  brakeServiceScopeResetsComponent,
  brakeStructuredActions,
} from './brake-health-evidence-ui';

function summary(overrides: Partial<BrakeHealthSummary> = {}): BrakeHealthSummary {
  const ep: BrakeEvidencePresentation = {
    overviewLabelDe: 'Neue Bremsen dokumentiert',
    overviewLabelEn: 'New brakes documented',
    uiStatusLabelDe: 'Gut',
    uiStatusLabelEn: 'Good',
    components: [
      {
        component: 'FRONT_PADS',
        labelDe: 'Vordere Beläge',
        labelEn: 'Front pads',
        condition: 'GOOD',
        valueMm: 10,
        valueLabelDe: '10.0 mm (dokumentiert)',
        valueLabelEn: '10.0 mm (documented)',
        evidenceClass: 'DOCUMENTED_REPLACEMENT',
        evidenceClassLabelDe: 'Dokumentierter Austausch',
        evidenceClassLabelEn: 'Documented replacement',
        sourceCode: 'DOCUMENTED_REPLACEMENT',
        sourceLabelDe: 'Dokumentierter Austausch',
        sourceLabelEn: 'Documented replacement',
        evidenceAt: '2026-01-01T00:00:00.000Z',
        odometerKm: 1000,
        confidence: 'MEDIUM',
        minimumThicknessMm: 2,
        minimumThicknessSource: 'manufacturer_confirmed',
        minimumThicknessSourceLabelDe: 'Hersteller bestätigt',
        minimumThicknessSourceLabelEn: 'Manufacturer confirmed',
        lastMeasurementAt: null,
        lastMeasurementMm: null,
        lastInstallationAt: '2026-01-01T00:00:00.000Z',
        modelVersion: 'brake-wear-v2',
        isLimiting: true,
        isModeled: true,
        remainingKm: {
          reliable: false,
          displayDe: 'ca. 20.000–30.000 km',
          displayEn: 'about 20,000–30,000 km',
          exactKm: null,
          bandMinKm: 20000,
          bandMaxKm: 30000,
          reasonDe: 'Bandbreite statt exakter Kilometer',
          reasonEn: 'Range instead of exact km',
        },
      },
      {
        component: 'REAR_PADS',
        labelDe: 'Hintere Beläge',
        labelEn: 'Rear pads',
        condition: 'GOOD',
        valueMm: 9,
        valueLabelDe: '9.0 mm (Referenz)',
        valueLabelEn: '9.0 mm (reference)',
        evidenceClass: 'SPEC_ESTIMATE',
        evidenceClassLabelDe: 'Referenz-Spezifikation',
        evidenceClassLabelEn: 'Reference spec',
        sourceCode: 'spec_fallback',
        sourceLabelDe: 'Referenz-Spezifikation',
        sourceLabelEn: 'Reference spec',
        evidenceAt: null,
        odometerKm: null,
        confidence: 'LOW',
        minimumThicknessMm: 2,
        minimumThicknessSource: null,
        minimumThicknessSourceLabelDe: '—',
        minimumThicknessSourceLabelEn: '—',
        lastMeasurementAt: null,
        lastMeasurementMm: null,
        lastInstallationAt: null,
        modelVersion: null,
        isLimiting: false,
        isModeled: true,
        remainingKm: {
          reliable: false,
          displayDe: 'noch nicht belastbar',
          displayEn: 'not yet reliable',
          exactKm: null,
          bandMinKm: null,
          bandMaxKm: null,
          reasonDe: 'Baseline unzureichend',
          reasonEn: 'Baseline insufficient',
        },
      },
      {
        component: 'FRONT_DISCS',
        labelDe: 'Vordere Scheiben',
        labelEn: 'Front discs',
        condition: 'WARNING',
        valueMm: 23,
        valueLabelDe: '23.0 mm (gemessen)',
        valueLabelEn: '23.0 mm (measured)',
        evidenceClass: 'MEASURED',
        evidenceClassLabelDe: 'Gemessen',
        evidenceClassLabelEn: 'Measured',
        sourceCode: 'MANUAL_MEASUREMENT',
        sourceLabelDe: 'Manuelle Messung',
        sourceLabelEn: 'Manual measurement',
        evidenceAt: '2026-02-01T00:00:00.000Z',
        odometerKm: 12000,
        confidence: 'HIGH',
        minimumThicknessMm: 22,
        minimumThicknessSource: 'manufacturer_confirmed',
        minimumThicknessSourceLabelDe: 'Hersteller bestätigt',
        minimumThicknessSourceLabelEn: 'Manufacturer confirmed',
        lastMeasurementAt: '2026-02-01T00:00:00.000Z',
        lastMeasurementMm: 23,
        lastInstallationAt: null,
        modelVersion: 'brake-wear-v2',
        isLimiting: false,
        isModeled: true,
        remainingKm: {
          reliable: true,
          displayDe: '15.000 km',
          displayEn: '15,000 km',
          exactKm: 15000,
          bandMinKm: null,
          bandMaxKm: null,
          reasonDe: null,
          reasonEn: null,
        },
      },
      {
        component: 'REAR_DISCS',
        labelDe: 'Hintere Scheiben',
        labelEn: 'Rear discs',
        condition: 'UNKNOWN',
        valueMm: null,
        valueLabelDe: '—',
        valueLabelEn: '—',
        evidenceClass: 'UNKNOWN',
        evidenceClassLabelDe: 'Unbekannt',
        evidenceClassLabelEn: 'Unknown',
        sourceCode: null,
        sourceLabelDe: 'Unbekannt',
        sourceLabelEn: 'Unknown',
        evidenceAt: null,
        odometerKm: null,
        confidence: 'UNKNOWN',
        minimumThicknessMm: null,
        minimumThicknessSource: null,
        minimumThicknessSourceLabelDe: '—',
        minimumThicknessSourceLabelEn: '—',
        lastMeasurementAt: null,
        lastMeasurementMm: null,
        lastInstallationAt: null,
        modelVersion: null,
        isLimiting: false,
        isModeled: false,
        remainingKm: {
          reliable: false,
          displayDe: '—',
          displayEn: '—',
          exactKm: null,
          bandMinKm: null,
          bandMaxKm: null,
          reasonDe: null,
          reasonEn: null,
        },
      },
    ],
    overallRemainingKm: {
      reliable: false,
      displayDe: 'ca. 15.000–25.000 km',
      displayEn: 'about 15,000–25,000 km',
      exactKm: null,
      bandMinKm: 15000,
      bandMaxKm: 25000,
      reasonDe: 'Bandbreite',
      reasonEn: 'Range',
    },
    dataQuality: [
      {
        code: 'COVERAGE_GAP',
        labelDe: 'Abdeckungslücke',
        labelEn: 'Coverage gap',
        detailDe: 'Gap',
        detailEn: 'Gap',
        active: true,
      },
      {
        code: 'MISSING_BASELINE',
        labelDe: 'Fehlende Baseline',
        labelEn: 'Missing baseline',
        detailDe: null,
        detailEn: null,
        active: false,
      },
    ],
    safety: [
      {
        code: 'DTC',
        labelDe: 'Fehlercode (DTC)',
        labelEn: 'Diagnostic trouble code',
        active: true,
        detailDe: 'Aktiver Bremsen-DTC: C1234',
        detailEn: 'Active brake DTC: C1234',
        severity: 'critical',
      },
    ],
    structuredActions: [
      { code: 'MEASURE_THICKNESS', labelDe: 'Dicke messen', labelEn: 'Measure thickness', priority: 2 },
      { code: 'REVIEW_SAFETY_EVIDENCE', labelDe: 'Sicherheits-Evidenz prüfen', labelEn: 'Review safety evidence', priority: 5 },
    ],
    modelVersion: 'brake-wear-v2',
    modelCalculatedAt: '2026-02-01T00:00:00.000Z',
    ...((overrides.evidencePresentation as Partial<BrakeEvidencePresentation> | undefined) ?? {}),
  };

  return {
    isInitialized: true,
    stateClass: 'ESTIMATED',
    overallCondition: 'GOOD',
    dataBasis: 'DOCUMENTED',
    confidenceLevel: 'MEDIUM',
    frontAxle: { condition: 'GOOD', dataBasis: 'DOCUMENTED', confidence: 'MEDIUM', estimatedRemainingKmMin: 15000, estimatedRemainingKmMax: 25000 },
    rearAxle: { condition: 'GOOD', dataBasis: 'ESTIMATED', confidence: 'LOW', estimatedRemainingKmMin: null, estimatedRemainingKmMax: null },
    frontAxleCondition: 'GOOD',
    rearAxleCondition: 'GOOD',
    frontDataBasis: 'DOCUMENTED',
    rearDataBasis: 'ESTIMATED',
    frontConfidence: 'MEDIUM',
    rearConfidence: 'LOW',
    estimatedFrontRemainingKmMin: 15000,
    estimatedFrontRemainingKmMax: 25000,
    estimatedRearRemainingKmMin: null,
    estimatedRearRemainingKmMax: null,
    nextInspectionRecommendedInKm: null,
    estimatedReplacementDueInKm: null,
    reasons: [],
    recommendations: [],
    alerts: [],
    openAlerts: [],
    lastMeasurementAt: null,
    lastMeasurementMileageKm: null,
    lastServiceAt: null,
    lastServiceMileageKm: null,
    updatedAt: null,
    legacy: { padsHealthPct: null, discsHealthPct: null, padsRemainingKm: null, discsRemainingKm: null, status: 'good', remainingKm: null },
    modeledComponents: { frontPads: true, rearPads: true, frontDiscs: true, rearDiscs: true, hasAnyPads: true, hasAnyDiscs: true, hasAnyModeled: true },
    modelCoverage: { distanceSinceAnchorKm: 1000, modeledDistanceKm: 800, modeledTripCount: 5, coverageRatio: 0.8, coverageRatioRaw: 0.8, underCoverageKm: 200, overCoverageKm: 0, coverageStatus: 'PARTIAL', hasGap: true, reconciliationRequired: false, source: 'OBSERVED' },
    baselineWarnings: [],
    provenanceWarnings: [],
    evidencePresentation: ep,
    ...overrides,
  } as BrakeHealthSummary;
}

describe('brake-health-evidence-ui', () => {
  it('shows documented replacement overview in DE', () => {
    expect(brakeOverviewLabel(summary(), 'de')).toBe('Neue Bremsen dokumentiert');
  });

  it('shows overview in EN', () => {
    expect(brakeOverviewLabel(summary(), 'en')).toBe('New brakes documented');
  });

  it('exposes four separate component lines', () => {
    expect(brakeComponentLines(summary()).map((c) => c.component)).toEqual([
      'FRONT_PADS',
      'REAR_PADS',
      'FRONT_DISCS',
      'REAR_DISCS',
    ]);
  });

  it('does not show fake precision for unreliable remaining km', () => {
    const label = brakeRemainingKmLabel(summary(), 'de');
    expect(label).toContain('–');
    expect(label).not.toMatch(/100\s*%/);
  });

  it('separates active data quality from safety', () => {
    expect(brakeActiveDataQuality(summary(), 'de').map((d) => d.code)).toEqual(['COVERAGE_GAP']);
    expect(brakeActiveSafety(summary(), 'de').map((s) => s.code)).toEqual(['DTC']);
  });

  it('lists structured CTAs from presentation', () => {
    const codes = brakeStructuredActions(summary(), 'de').map((a) => a.code);
    expect(codes).toContain('MEASURE_THICKNESS');
    expect(codes).toContain('REVIEW_SAFETY_EVIDENCE');
  });

  it('inspection and fluid service do not reset components', () => {
    expect(brakeServiceScopeResetsComponent('inspection_only')).toBe(false);
    expect(brakeServiceScopeResetsComponent('brake_fluid_service')).toBe(false);
    expect(brakeServiceScopeResetsComponent('pads_service')).toBe(true);
  });

  it('falls back when evidencePresentation missing', () => {
    expect(brakeOverviewLabel(summary({ evidencePresentation: undefined, stateClass: 'NO_BASELINE' }), 'de'))
      .toBe('Bremsbaseline erforderlich');
  });
});

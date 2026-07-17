import {
  buildBrakeEvidencePresentation,
  buildBrakeRemainingKmPresentation,
  formatComponentValueLabel,
  resolveBrakeOverviewLabel,
  resolveComponentEvidenceClass,
  type BrakeComponentBuildState,
} from './brake-health-presentation';
import type { BrakeCondition, BrakeConfidenceLevel } from './brake-status';

function componentState(
  overrides: Partial<BrakeComponentBuildState> & Pick<BrakeComponentBuildState, 'component'>,
): BrakeComponentBuildState {
  return {
    condition: 'GOOD',
    dataBasis: 'ESTIMATED',
    confidence: 'MEDIUM',
    measuredMm: null,
    estimatedMm: 8.5,
    anchorMm: 10,
    remainingKm: 25000,
    remainingKmMin: 20000,
    remainingKmMax: 30000,
    evidenceClass: 'MODEL_ESTIMATED',
    sourceCode: 'TELEMATICS_ESTIMATION',
    evidenceAt: '2026-01-01T00:00:00.000Z',
    odometerKm: 12000,
    lastMeasurementAt: null,
    lastMeasurementMm: null,
    lastInstallationAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function presentationInput(
  overrides: Partial<Parameters<typeof buildBrakeEvidencePresentation>[0]> = {},
) {
  return {
    isInitialized: true,
    stateClass: 'ESTIMATED' as const,
    overallCondition: 'GOOD' as BrakeCondition,
    modeledComponents: {
      frontPads: true,
      rearPads: true,
      frontDiscs: true,
      rearDiscs: true,
      hasAnyPads: true,
      hasAnyDiscs: true,
      hasAnyModeled: true,
    },
    modelCoverage: { hasGap: false, coverageStatus: 'FULL' },
    componentThresholds: [
      {
        component: 'FRONT_PADS' as const,
        warningThresholdMm: 3,
        criticalThresholdMm: 2,
        source: 'manufacturer_confirmed',
        confirmed: true,
        thresholdMissing: false,
      },
      {
        component: 'REAR_PADS' as const,
        warningThresholdMm: 3,
        criticalThresholdMm: 2,
        source: 'manufacturer_confirmed',
        confirmed: true,
        thresholdMissing: false,
      },
      {
        component: 'FRONT_DISCS' as const,
        warningThresholdMm: 24,
        criticalThresholdMm: 22,
        source: 'manufacturer_confirmed',
        confirmed: true,
        thresholdMissing: false,
      },
      {
        component: 'REAR_DISCS' as const,
        warningThresholdMm: 10,
        criticalThresholdMm: 9,
        source: 'manufacturer_confirmed',
        confirmed: true,
        thresholdMissing: false,
      },
    ],
    limitingComponent: 'FRONT_PADS' as const,
    openAlerts: [],
    componentStates: [
      componentState({ component: 'FRONT_PADS' }),
      componentState({ component: 'REAR_PADS' }),
      componentState({ component: 'FRONT_DISCS', evidenceClass: 'SPEC_ESTIMATE', dataBasis: 'DOCUMENTED' }),
      componentState({ component: 'REAR_DISCS', evidenceClass: 'SPEC_ESTIMATE', dataBasis: 'DOCUMENTED' }),
    ],
    dataQualityFlags: {
      missingBaseline: false,
      specUnconfirmed: false,
      coverageGap: false,
      distanceConflict: false,
      staleEvidence: false,
    },
    safetyFlags: {
      abs: false,
      dtc: false,
      dtcCode: null,
      wearSensor: false,
      immediateReplacement: false,
    },
    predictionCapable: true,
    overallRemainingKmMin: 20000,
    overallRemainingKmMax: 30000,
    overallRemainingKmPoint: 25000,
    overallConfidence: 'MEDIUM' as BrakeConfidenceLevel,
    modelCalculatedAt: '2026-02-01T00:00:00.000Z',
    hasOdometerGap: false,
    ...overrides,
  };
}

describe('brake-health-presentation', () => {
  it('labels measured thickness honestly', () => {
    const label = formatComponentValueLabel(4.2, 'MEASURED');
    expect(label.de).toContain('gemessen');
    expect(label.de).not.toContain('100 %');
  });

  it('labels spec fallback as reference, not measured', () => {
    const label = formatComponentValueLabel(12, 'SPEC_ESTIMATE');
    expect(label.de).toContain('Referenz');
    expect(label.de).not.toContain('gemessen');
  });

  it('shows not yet reliable without prediction anchor', () => {
    const display = buildBrakeRemainingKmPresentation({
      minKm: null,
      maxKm: null,
      pointKm: 20000,
      confidence: 'HIGH',
      evidenceClass: 'MEASURED',
      predictionCapable: false,
      coverageGap: false,
    });
    expect(display.displayDe).toBe('noch nicht belastbar');
  });

  it('shows band for model estimated remaining km', () => {
    const display = buildBrakeRemainingKmPresentation({
      minKm: 18000,
      maxKm: 32000,
      pointKm: 25000,
      confidence: 'MEDIUM',
      evidenceClass: 'MODEL_ESTIMATED',
      predictionCapable: true,
      coverageGap: false,
    });
    expect(display.reliable).toBe(false);
    expect(display.displayDe).toContain('–');
  });

  it('resolves documented replacement overview for new brakes', () => {
    const overview = resolveBrakeOverviewLabel({
      isInitialized: true,
      stateClass: 'ESTIMATED',
      componentStates: [
        componentState({
          component: 'FRONT_PADS',
          evidenceClass: 'DOCUMENTED_REPLACEMENT',
          dataBasis: 'DOCUMENTED',
        }),
        componentState({
          component: 'REAR_PADS',
          evidenceClass: 'DOCUMENTED_REPLACEMENT',
          dataBasis: 'DOCUMENTED',
        }),
      ],
    });
    expect(overview.de).toBe('Neue Bremsen dokumentiert');
  });

  it('resolves spec estimate overview label', () => {
    const overview = resolveBrakeOverviewLabel({
      isInitialized: true,
      stateClass: 'ESTIMATED',
      componentStates: [
        componentState({
          component: 'FRONT_PADS',
          evidenceClass: 'SPEC_ESTIMATE',
        }),
      ],
    });
    expect(overview.de).toBe('Nominaler Ausgangswert aus Referenzdaten');
  });

  it('classifies measured evidence class from mm reading', () => {
    expect(
      resolveComponentEvidenceClass({
        dataBasis: 'ESTIMATED',
        anchorValidationStatus: 'measured',
        measuredMm: 5.1,
        estimatedMm: 5.1,
        isModeled: true,
      }),
    ).toBe('MEASURED');
  });

  it('builds four separate component lines', () => {
    const ep = buildBrakeEvidencePresentation(presentationInput());
    expect(ep.components).toHaveLength(4);
    expect(ep.components.map((c) => c.component)).toEqual([
      'FRONT_PADS',
      'REAR_PADS',
      'FRONT_DISCS',
      'REAR_DISCS',
    ]);
  });

  it('separates safety DTC from wear data quality', () => {
    const ep = buildBrakeEvidencePresentation(
      presentationInput({
        openAlerts: [
          {
            code: 'BRAKE_SYSTEM_DTC',
            alertType: 'BRAKE_DTC',
            category: 'SAFETY',
            reasonCode: 'BRAKE_DTC_ACTIVE',
            severity: 'critical',
            message: 'DTC aktiv',
            messageEn: 'DTC active',
            displayMode: 'SAFETY_EVIDENCE',
          },
          {
            code: 'BRAKE_COVERAGE_GAP',
            alertType: 'COVERAGE_GAP',
            category: 'DATA_QUALITY',
            reasonCode: 'COVERAGE_GAP',
            severity: 'info',
            message: 'Gap',
            messageEn: 'Gap',
            displayMode: 'DATA_GAP',
          },
        ],
        safetyFlags: {
          abs: false,
          dtc: true,
          dtcCode: 'C1234',
          wearSensor: false,
          immediateReplacement: false,
        },
        dataQualityFlags: {
          missingBaseline: false,
          specUnconfirmed: false,
          coverageGap: true,
          distanceConflict: false,
          staleEvidence: false,
        },
      }),
    );
    expect(ep.safety.find((s) => s.code === 'DTC')?.active).toBe(true);
    expect(ep.dataQuality.find((d) => d.code === 'COVERAGE_GAP')?.active).toBe(true);
    expect(ep.structuredActions.some((a) => a.code === 'REVIEW_SAFETY_EVIDENCE')).toBe(true);
  });

  it('marks measured critical component condition', () => {
    const ep = buildBrakeEvidencePresentation(
      presentationInput({
        overallCondition: 'CRITICAL',
        componentStates: [
          componentState({
            component: 'FRONT_PADS',
            condition: 'CRITICAL',
            evidenceClass: 'MEASURED',
            measuredMm: 1.5,
            dataBasis: 'MEASURED',
            confidence: 'HIGH',
          }),
        ],
      }),
    );
    expect(ep.components[0].condition).toBe('CRITICAL');
    expect(ep.components[0].evidenceClass).toBe('MEASURED');
  });

  it('includes measure and service CTAs for unknown evidence', () => {
    const ep = buildBrakeEvidencePresentation(
      presentationInput({
        isInitialized: false,
        dataQualityFlags: {
          missingBaseline: true,
          specUnconfirmed: false,
          coverageGap: false,
          distanceConflict: false,
          staleEvidence: false,
        },
        componentStates: [
          componentState({ component: 'FRONT_PADS', evidenceClass: 'UNKNOWN' }),
        ],
      }),
    );
    const codes = ep.structuredActions.map((a) => a.code);
    expect(codes).toContain('RECORD_SERVICE');
    expect(codes).toContain('MEASURE_THICKNESS');
  });
});

import {
  buildRemainingKmPresentation,
  buildTireEvidencePresentation,
  formatTreadValueLabel,
  resolveTireUiStatus,
} from './tire-health-presentation';
import type { TireHealthSummary } from './tire-health.service';
import { emptyTirePressureContext } from './tire-pressure-context.builder';
import { TireEvidenceSource } from '@prisma/client';

function baseSummary(overrides: Partial<TireHealthSummary> = {}): TireHealthSummary {
  const pressureContext = emptyTirePressureContext();
  const core = {
    overallPercent: 70,
    overallRemainingKm: 12000,
    healthStatus: 'GOOD',
    confidenceScore: 65,
    confidenceLabel: 'Medium',
    worstTirePosition: 'FL',
    worstTirePercent: 72,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: '2026-01-01T00:00:00Z',
    totalKmOnSet: 5000,
    wearRateMmPer1000km: 0.2,
    alerts: [],
    tireCondition: 'NEW_INSTALLED',
    tireArchetype: 'default',
    tireSpecMatched: true,
    tireSpecConfidence: 80,
    dataCompletenessConfidence: 70,
    modelConfidence: 65,
    referenceNewTreadSource: 'manual_confirmed',
    replacementThresholdSource: 'season_fallback',
    currentTreadSource: 'fallback_estimate',
    currentTreadValue: 6.5,
    currentTreadEvidenceSource: TireEvidenceSource.MODEL_ESTIMATED,
    isMeasured: false,
    isEstimated: true,
    isDefaultAssumption: false,
    lastActualMeasurementAt: null,
    baselineSource: TireEvidenceSource.USER_CONFIRMED,
    operationalReplacementMm: 3,
    topWearDrivers: [],
    actionState: 'OBSERVE',
    actionReasons: [],
    measurementState: 'estimated',
    dataQualityWarnings: [],
    pressureContext,
    recommendedPressure: pressureContext.recommendedPressure,
    pressureSpecMissingLabel: null,
    latestMeasurementAt: null,
    overallStatus: 'GOOD',
    displayMode: 'ESTIMATED',
    confidence: 'MEDIUM',
    lowestTreadMm: 6.5,
    lowestTreadPosition: 'Front left',
    measuredTreadMm: null,
    estimatedTreadMm: 6.5,
    displayTreadMm: 6.5,
    lastMeasurementAt: null,
    measurementAgeDays: null,
    estimatedRemainingKm: 12000,
    pressureStatus: 'GOOD',
    seasonStatus: 'GOOD',
    unevenWearStatus: 'GOOD',
    recommendations: ['No tire action required.'],
    predictionCapable: true,
    odometerAnchorStatus: 'VALIDATED',
    odometerAnchorConfidence: 0.9,
    installedOdometerSource: 'PROVIDER_DIMO',
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: false,
    ...overrides,
  } satisfies Omit<TireHealthSummary, 'evidencePresentation'>;

  return {
    ...core,
    evidencePresentation: buildTireEvidencePresentation({ summary: core as TireHealthSummary }),
  };
}

describe('tire-health-presentation', () => {
  it('labels 8 mm default as standard assumption, not measured', () => {
    const label = formatTreadValueLabel(8.0, 'DEFAULT_ASSUMPTION', 'FL');
    expect(label.de).toContain('Standardannahme 8.0 mm');
    expect(label.de).not.toContain('Gemessen');
    expect(label.en).toContain('standard assumption 8.0 mm');
  });

  it('shows remaining km band when confidence is low', () => {
    const display = buildRemainingKmPresentation({
      km: 10000,
      confidence: 'LOW',
      predictionCapable: true,
      displayMode: 'ESTIMATED',
      isDefaultAssumption: true,
    });
    expect(display.reliable).toBe(false);
    expect(display.displayDe).toContain('–');
    expect(display.exactKm).toBeNull();
  });

  it('shows not yet reliable without prediction anchor', () => {
    const display = buildRemainingKmPresentation({
      km: 10000,
      confidence: 'HIGH',
      predictionCapable: false,
      displayMode: 'MEASURED',
      isDefaultAssumption: false,
    });
    expect(display.displayDe).toBe('noch nicht belastbar');
  });

  it('resolves MEASUREMENT_REQUIRED when no measurements', () => {
    expect(
      resolveTireUiStatus({
        overallStatus: 'GOOD',
        hasActiveSet: true,
        hasMeasurements: false,
        isDefaultAssumption: true,
        confidence: 'LOW',
        actionState: 'CHECK_SOON',
        measurementOverdue: false,
      }),
    ).toBe('MEASUREMENT_REQUIRED');
  });

  it('builds structured actions from summary state', () => {
    const summary = baseSummary({
      hasMeasurements: false,
      predictionCapable: false,
      tireSpecMatched: false,
      pressureSpecMissingLabel: 'Missing',
      pressureStatus: 'WARNING',
      actionState: 'REPLACE',
      alerts: [{ type: 'ROTATION_OVERDUE', severity: 'warning', message: 'rotate' }],
    });
    const codes = summary.evidencePresentation.structuredActions.map((a) => a.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'REPLACE_TIRES',
        'MEASURE_TREAD',
        'CAPTURE_ODOMETER_ANCHOR',
        'CONFIRM_TIRE_SPEC',
        'SET_RECOMMENDED_PRESSURE',
        'CHECK_PRESSURE',
      ]),
    );
    expect(codes).toContain('REVIEW_ROTATION');
  });
});

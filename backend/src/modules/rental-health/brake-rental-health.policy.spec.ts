import {
  buildBrakeModuleHealth,
  buildBrakeRentalHealthReadModel,
  isBrakeRentalHardBlocked,
} from './brake-rental-health.policy';
import type { BrakeHealthSummaryDto } from '../vehicle-intelligence/brakes/brake-health.service';

function alert(
  partial: Partial<NonNullable<BrakeHealthSummaryDto['openAlerts']>[number]> &
    Pick<NonNullable<BrakeHealthSummaryDto['openAlerts']>[number], 'alertType' | 'category'>,
) {
  return {
    code: 'BRAKE_GENERIC' as const,
    reasonCode: partial.reasonCode ?? partial.alertType,
    severity: partial.severity ?? 'warning',
    message: partial.message ?? partial.alertType,
    messageEn: partial.messageEn ?? partial.alertType,
    displayMode: partial.displayMode ?? 'ESTIMATED',
    ...partial,
  };
}

function summary(overrides: Partial<BrakeHealthSummaryDto> = {}): BrakeHealthSummaryDto {
  return {
    isInitialized: true,
    stateClass: 'MEASURED',
    overallCondition: 'GOOD',
    dataBasis: 'MEASURED',
    confidenceLevel: 'HIGH',
    frontAxle: { condition: 'GOOD', dataBasis: 'MEASURED', confidence: 'HIGH', estimatedRemainingKmMin: 10000, estimatedRemainingKmMax: 12000 },
    rearAxle: { condition: 'GOOD', dataBasis: 'MEASURED', confidence: 'HIGH', estimatedRemainingKmMin: 10000, estimatedRemainingKmMax: 12000 },
    frontAxleCondition: 'GOOD',
    rearAxleCondition: 'GOOD',
    frontDataBasis: 'MEASURED',
    rearDataBasis: 'MEASURED',
    frontConfidence: 'HIGH',
    rearConfidence: 'HIGH',
    estimatedFrontRemainingKmMin: 10000,
    estimatedFrontRemainingKmMax: 12000,
    estimatedRearRemainingKmMin: 10000,
    estimatedRearRemainingKmMax: 12000,
    nextInspectionRecommendedInKm: null,
    estimatedReplacementDueInKm: null,
    reasons: [],
    recommendations: [],
    alerts: [],
    openAlerts: [],
    lastMeasurementAt: new Date().toISOString(),
    lastMeasurementMileageKm: 10000,
    lastServiceAt: new Date().toISOString(),
    lastServiceMileageKm: 10000,
    updatedAt: new Date().toISOString(),
    lastRecalculatedAt: new Date().toISOString(),
    modeledComponents: {
      frontPads: true,
      rearPads: true,
      frontDiscs: false,
      rearDiscs: false,
      hasAnyPads: true,
      hasAnyDiscs: false,
      hasAnyModeled: true,
    },
    modelCoverage: {
      distanceSinceAnchorKm: 1000,
      modeledDistanceKm: 1000,
      modeledTripCount: 5,
      coverageRatio: 1,
      coverageRatioRaw: 1,
      underCoverageKm: 0,
      overCoverageKm: 0,
      coverageStatus: 'OK' as never,
      hasGap: false,
      reconciliationRequired: false,
      source: 'TRIP_IMPACT' as never,
    },
    baselineWarnings: [],
    provenanceWarnings: [],
    legacy: {
      padsHealthPct: 80,
      discsHealthPct: null,
      padsRemainingKm: 10000,
      discsRemainingKm: null,
      status: 'good',
      remainingKm: 10000,
    },
    componentThresholds: [],
    hasAlert: false,
    ...overrides,
  };
}

describe('brake-rental-health.policy', () => {
  it('measured critical wear hard-blocks rental', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        overallCondition: 'CRITICAL',
        dataBasis: 'MEASURED',
        openAlerts: [
          alert({
            alertType: 'PAD_CRITICAL',
            category: 'WEAR',
            severity: 'critical',
            displayMode: 'MEASURED',
            reasonCode: 'PAD_CRITICAL_MEASURED',
            message: 'Gemessener kritischer Belag',
            messageEn: 'Measured critical pad',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('HARD_BLOCK');
    expect(isBrakeRentalHardBlocked(model)).toBe(true);
    expect(model.wearCondition).toBe('CRITICAL');
    expect(model.blockingReasons.length).toBeGreaterThan(0);
  });

  it('estimated critical wear requires measurement but does not hard-block', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        overallCondition: 'CRITICAL',
        dataBasis: 'ESTIMATED',
        frontAxle: { condition: 'CRITICAL', dataBasis: 'ESTIMATED', confidence: 'MEDIUM', estimatedRemainingKmMin: 500, estimatedRemainingKmMax: 800 },
        openAlerts: [
          alert({
            alertType: 'PAD_CRITICAL',
            category: 'WEAR',
            severity: 'critical',
            displayMode: 'ESTIMATED',
            reasonCode: 'PAD_CRITICAL_ESTIMATED',
            message: 'Geschätzter kritischer Belag',
            messageEn: 'Estimated critical pad',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('MEASUREMENT_REQUIRED');
    expect(isBrakeRentalHardBlocked(model)).toBe(false);
    expect(model.wearCondition).toBe('WARNING');
    expect(model.reviewRequirement).toBe('MEASUREMENT_REQUIRED');
  });

  it('spec-only / no baseline requires measurement', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        isInitialized: false,
        overallCondition: 'UNKNOWN',
        dataBasis: 'UNKNOWN',
        openAlerts: [
          alert({
            alertType: 'NO_BASELINE',
            category: 'DATA_QUALITY',
            severity: 'info',
            displayMode: 'DATA_GAP',
            reasonCode: 'NO_BASELINE',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('MEASUREMENT_REQUIRED');
    expect(model.dataQualityCondition).toBe('UNKNOWN');
    expect(model.reviewRequirement).toBe('MEASUREMENT_REQUIRED');
  });

  it('coverage gap is data quality warning without wear inflation', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        overallCondition: 'GOOD',
        openAlerts: [
          alert({
            alertType: 'COVERAGE_GAP',
            category: 'DATA_QUALITY',
            severity: 'info',
            displayMode: 'DATA_GAP',
            reasonCode: 'COVERAGE_GAP',
            message: 'Coverage gap',
            messageEn: 'Coverage gap',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('DATA_QUALITY_WARNING');
    expect(model.wearCondition).toBe('GOOD');
    expect(model.dataQualityCondition).toBe('WARNING');
    expect(isBrakeRentalHardBlocked(model)).toBe(false);
  });

  it('ABS critical DTC hard-blocks rental', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        overallCondition: 'CRITICAL',
        openAlerts: [
          alert({
            alertType: 'ABS_WARNING',
            category: 'SAFETY',
            severity: 'critical',
            displayMode: 'SAFETY_EVIDENCE',
            reasonCode: 'ABS_DTC_CRITICAL',
            message: 'ABS Fehler',
            messageEn: 'ABS fault',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('HARD_BLOCK');
    expect(model.safetyCondition).toBe('CRITICAL');
    expect(model.activeSafetyEvidence).toHaveLength(1);
  });

  it('non-critical brake DTC requires review but not hard block', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        overallCondition: 'WARNING',
        openAlerts: [
          alert({
            alertType: 'BRAKE_DTC',
            category: 'SAFETY',
            severity: 'warning',
            displayMode: 'SAFETY_EVIDENCE',
            reasonCode: 'BRAKE_DTC_ACTIVE',
            message: 'Bremsen DTC aktiv',
            messageEn: 'Brake DTC active',
          }),
        ],
      }),
    });
    expect(model.rentalDecision).toBe('REVIEW_REQUIRED');
    expect(isBrakeRentalHardBlocked(model)).toBe(false);
    expect(model.reviewRequirement).toBe('REVIEW_REQUIRED');
  });

  it('stale evidence requires review', () => {
    const staleDate = new Date(Date.now() - 600 * 86400000).toISOString();
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        lastMeasurementAt: staleDate,
        openAlerts: [
          alert({
            alertType: 'STALE_EVIDENCE',
            category: 'DATA_QUALITY',
            severity: 'info',
            displayMode: 'DATA_GAP',
            reasonCode: 'STALE_EVIDENCE',
          }),
        ],
      }),
    });
    expect(model.measurementFreshness).toBe('stale');
    expect(model.rentalDecision).toBe('REVIEW_REQUIRED');
    expect(model.structuredReasonCodes).toContain('DATA_STALE_EVIDENCE');
  });

  it('unknown state never allows good rental decision', () => {
    const moduleHealth = buildBrakeModuleHealth({
      summary: summary({
        isInitialized: false,
        overallCondition: 'UNKNOWN',
        dataBasis: 'UNKNOWN',
        frontAxleCondition: 'UNKNOWN',
        rearAxleCondition: 'UNKNOWN',
      }),
    });
    expect(moduleHealth.state).not.toBe('good');
    expect(moduleHealth.brake_read_model.rentalDecision).toBe('MEASUREMENT_REQUIRED');
  });

  it('module load error is unavailable with review required', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: null,
      moduleLoadError: 'BrakeHealthService timeout',
    });
    expect(model.rentalDecision).toBe('UNAVAILABLE');
    expect(model.reviewRequirement).toBe('REVIEW_REQUIRED');
    expect(model.structuredReasonCodes).toContain('MODULE_UNAVAILABLE');
  });

  it('active override clears hard block', () => {
    const measuredCriticalSummary = summary({
      overallCondition: 'CRITICAL',
      dataBasis: 'MEASURED',
      openAlerts: [
        alert({
          alertType: 'PAD_CRITICAL',
          category: 'WEAR',
          severity: 'critical',
          displayMode: 'MEASURED',
          reasonCode: 'PAD_CRITICAL_MEASURED',
          message: 'Kritisch',
          messageEn: 'Critical',
        }),
      ],
    });
    const base = buildBrakeRentalHealthReadModel({ summary: measuredCriticalSummary });
    expect(isBrakeRentalHardBlocked(base)).toBe(true);

    const overridden = buildBrakeRentalHealthReadModel({
      summary: measuredCriticalSummary,
      activeReviewOverride: {
        id: 'ov-1',
        reason: 'Werkstatt Freigabe nach Prüfung',
        grantedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    expect(isBrakeRentalHardBlocked(overridden)).toBe(false);
    expect(overridden.structuredReasonCodes).toContain('REVIEW_OVERRIDE_ACTIVE');
  });

  it('booking gate and module health share the same hard-block signal', () => {
    const moduleHealth = buildBrakeModuleHealth({
      summary: summary({
        overallCondition: 'CRITICAL',
        dataBasis: 'MEASURED',
        openAlerts: [
          alert({
            alertType: 'IMMEDIATE_REPLACEMENT',
            category: 'SAFETY',
            severity: 'critical',
            displayMode: 'SAFETY_EVIDENCE',
            reasonCode: 'IMMEDIATE_REPLACEMENT_DOCUMENTED',
            message: 'Sofortiger Ersatz',
            messageEn: 'Immediate replacement',
          }),
        ],
      }),
    });
    expect(moduleHealth.state).toBe('critical');
    expect(isBrakeRentalHardBlocked(moduleHealth.brake_read_model)).toBe(true);
    expect(moduleHealth.brake_read_model.rentalBlockingEvidence?.message).toContain('Sofort');
  });

  it('exposes separated freshness timestamps', () => {
    const measuredAt = '2026-06-01T10:00:00.000Z';
    const recalculatedAt = '2026-07-01T10:00:00.000Z';
    const updatedAt = '2026-07-02T10:00:00.000Z';
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        lastMeasurementAt: measuredAt,
        lastRecalculatedAt: recalculatedAt,
        updatedAt,
        openAlerts: [
          alert({
            alertType: 'BRAKE_DTC',
            category: 'SAFETY',
            severity: 'warning',
            displayMode: 'SAFETY_EVIDENCE',
            reasonCode: 'BRAKE_DTC_ACTIVE',
            message: 'DTC',
            messageEn: 'DTC',
          }),
        ],
      }),
    });
    expect(model.lastMeasurementAt).toBe(measuredAt);
    expect(model.lastModelCalculatedAt).toBe(recalculatedAt);
    expect(model.lastDataReceivedAt).toBe(updatedAt);
    expect(model.lastSafetyEvidenceAt).toBe(updatedAt);
  });

  it('hasWearOrSafetyAlert ignores data-quality-only alerts', () => {
    const model = buildBrakeRentalHealthReadModel({
      summary: summary({
        openAlerts: [
          alert({
            alertType: 'COVERAGE_GAP',
            category: 'DATA_QUALITY',
            severity: 'info',
            displayMode: 'DATA_GAP',
            reasonCode: 'COVERAGE_GAP',
          }),
        ],
      }),
    });
    expect(model.hasWearOrSafetyAlert).toBe(false);
  });
});

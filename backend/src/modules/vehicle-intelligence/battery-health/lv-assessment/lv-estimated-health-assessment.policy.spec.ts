import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceStrength,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import { LV_START_PROXY_SCORE_WEIGHT_PERCENT } from '../lv-start-proxy/lv-start-proxy-diagnostic.policy';
import {
  LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION,
  LV_ESTIMATED_HEALTH_SCORE_WEIGHTS,
} from './lv-assessment-thresholds';
import {
  buildLvEstimatedHealthAssessmentIdempotencyKey,
  computeLvEstimatedHealthAssessment,
} from './lv-estimated-health-assessment.policy';
import type { LvAssessmentEvidenceCandidate } from './lv-evidence-selection.policy';

const NOW = new Date('2026-07-16T12:00:00.000Z');
const VEHICLE_ID = 'veh-1';

function iceAgmPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function candidate(
  partial: Partial<LvAssessmentEvidenceCandidate> &
    Pick<LvAssessmentEvidenceCandidate, 'measurementId' | 'type'>,
): LvAssessmentEvidenceCandidate {
  return {
    quality: BatteryMeasurementQuality.VALID,
    observedAt: NOW,
    sessionId: null,
    sessionType: null,
    numericValue: 12.65,
    context: null,
    provenance: {
      providerTimestamp: NOW,
      receivedAt: NOW,
    },
    cycleKey: null,
    ...partial,
  };
}

describe('lv-estimated-health-assessment.policy', () => {
  it('exposes versioned model and zero start-proxy weight', () => {
    expect(LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION).toBe(1);
    expect(LV_ESTIMATED_HEALTH_SCORE_WEIGHTS.START_DIP_PROXY).toBe(0);
    expect(LV_START_PROXY_SCORE_WEIGHT_PERCENT).toBe(0);
  });

  it('produces a high-confidence telemetry assessment from VALID REST evidence', () => {
    const result = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      ambientTemperatureC: 18,
      ambientTemperatureSource: 'EXTERIOR_AIR',
      candidates: [
        candidate({
          measurementId: 'rest-60m',
          type: BatteryMeasurementType.REST_60M,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-1',
          numericValue: 12.65,
        }),
        candidate({
          measurementId: 'rest-6h',
          type: BatteryMeasurementType.REST_6H,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-1',
          numericValue: 12.64,
          observedAt: new Date('2026-07-16T11:00:00.000Z'),
        }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.assessments).toHaveLength(1);
    const assessment = result.assessments[0];
    expect(assessment.assessmentTrack).toBe('TELEMETRY');
    expect(assessment.scoreSemantics).toBe('ESTIMATED_HEALTH_NOT_SOH');
    expect(assessment.estimatedHealthScore).not.toBeNull();
    expect(assessment.confidence).toBe('HIGH');
    expect(assessment.evidenceStrength).toBe(BatteryEvidenceStrength.PRIMARY);
    expect(assessment.dataQuality).toBe('ESTIMATED');
    expect(assessment.measurementCoverage.weightedInputCount).toBeGreaterThan(0);
    expect(assessment.modelVersion).toBe(LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION);
    expect(assessment.validFrom).toBeTruthy();
    expect(assessment.validUntil).toBeTruthy();
    expect(assessment.publicationEligible).toBe(true);
    expect(assessment.reasons.some((r) => r.code === 'score_is_not_soh')).toBe(true);
    expect(assessment.inputSummary.hysteresisDeferredToPublication).toBe(true);
  });

  it('produces low-confidence assessment when ambient temperature is missing', () => {
    const withTemp = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      ambientTemperatureC: 12,
      ambientTemperatureSource: 'TRIP_CONTEXT',
      candidates: [
        candidate({
          measurementId: 'rest-only',
          type: BatteryMeasurementType.REST_60M,
          cycleKey: 'lv-rest:win-2',
          numericValue: 12.55,
        }),
      ],
    });
    const withoutTemp = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-only',
          type: BatteryMeasurementType.REST_60M,
          cycleKey: 'lv-rest:win-2',
          numericValue: 12.55,
        }),
      ],
    });

    expect(withTemp.ok).toBe(true);
    expect(withoutTemp.ok).toBe(true);
    expect(withoutTemp.assessments[0].confidenceScore).toBeLessThan(
      withTemp.assessments[0].confidenceScore,
    );
    expect(withoutTemp.assessments[0].estimatedHealthScore).toBe(
      withTemp.assessments[0].estimatedHealthScore,
    );
  });

  it('returns no assessment for missing evidence', () => {
    const result = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [],
    });

    expect(result.ok).toBe(false);
    expect(result.assessments).toHaveLength(0);
    expect(result.reasons.some((r) => r.code === 'missing_evidence')).toBe(true);
  });

  it('returns unsupported profile without assessment output', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LITHIUM,
      lvSignalPresent: false,
    });

    const result = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy,
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'live',
          type: BatteryMeasurementType.LIVE_VOLTAGE,
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.unsupportedProfile).toBe(true);
    expect(result.assessments).toHaveLength(0);
  });

  it('creates separate workshop override assessment alongside telemetry', () => {
    const result = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest',
          type: BatteryMeasurementType.REST_60M,
          cycleKey: 'lv-rest:win-3',
          numericValue: 12.4,
        }),
        candidate({
          measurementId: 'workshop',
          type: BatteryMeasurementType.WORKSHOP_OCV,
          numericValue: 12.7,
          provenance: {
            receivedAt: NOW,
            serviceEventId: 'svc-1',
          },
        }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.assessments).toHaveLength(2);
    const workshop = result.assessments.find(
      (row) => row.assessmentTrack === 'WORKSHOP_OVERRIDE',
    );
    const telemetry = result.assessments.find(
      (row) => row.assessmentTrack === 'TELEMETRY',
    );
    expect(workshop?.evidenceStrength).toBe(BatteryEvidenceStrength.OVERRIDE);
    expect(workshop?.estimatedHealthScore).toBeGreaterThan(
      telemetry?.estimatedHealthScore ?? 0,
    );
    expect(workshop?.idempotencyKey).not.toBe(telemetry?.idempotencyKey);
  });

  it('allows shadow experimental REST in shadow mode without publication eligibility', () => {
    const result = computeLvEstimatedHealthAssessment({
      vehicleId: VEHICLE_ID,
      policy: iceAgmPolicy(),
      now: NOW,
      assessmentMode: 'SHADOW',
      candidates: [
        candidate({
          measurementId: 'shadow-rest',
          type: BatteryMeasurementType.REST_60M,
          quality: BatteryMeasurementQuality.SHADOW,
          context: { shadowMode: true },
          cycleKey: 'lv-rest:shadow-1',
          numericValue: 12.58,
        }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.assessments[0].assessmentMode).toBe('SHADOW');
    expect(result.assessments[0].publicationEligible).toBe(false);
    expect(result.assessments[0].measurementCoverage.shadowExperimentalCount).toBe(1);
    expect(
      result.assessments[0].reasons.some(
        (r) => r.code === 'shadow_experimental_rest',
      ),
    ).toBe(true);
  });

  it('builds stable idempotent assessment keys', () => {
    const key = buildLvEstimatedHealthAssessmentIdempotencyKey({
      vehicleId: VEHICLE_ID,
      assessmentTrack: 'TELEMETRY',
      assessmentMode: 'CANONICAL',
      evidenceFingerprint: 'rest-1|rest-2',
    });
    expect(key).toContain(VEHICLE_ID);
    expect(key).toContain('TELEMETRY');
    expect(key).toContain(`m${LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION}`);
  });
});

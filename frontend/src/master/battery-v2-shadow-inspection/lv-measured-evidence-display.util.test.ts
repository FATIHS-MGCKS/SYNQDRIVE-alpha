import { describe, expect, it } from 'vitest';
import type { LvMeasuredIntelligenceV1, LvMeasuredVoltagePointV1 } from './lv-measured-intelligence.types';
import {
  buildEpisodeEvaluabilityView,
  buildLatestMeasuredEvidenceView,
} from './lv-measured-evidence-display.util';

function baseData(overrides: Partial<LvMeasuredIntelligenceV1> = {}): LvMeasuredIntelligenceV1 {
  return {
    readModelContractVersion: 'LV_MEASURED_INTELLIGENCE_V1',
    organizationId: 'org',
    vehicleId: 'veh',
    scientificBoundary: {
      batteryHealthAssessment: 'NOT_ASSESSED',
      customerPublication: 'OFF',
      e3Runtime: 'INACTIVE',
      f6Calibration: 'OFF',
      noSohPercent: true,
      noGoodBadClassification: true,
    },
    latestMeasured: null,
    historicalMeasured: [],
    restSessionEpisodes: [],
    longitudinalD4: {
      epistemicBand: 'NOT_ASSESSED',
      latestRevisionId: null,
      latestRevisionCreatedAt: null,
      revisionCountBounded: 0,
      sourceEvidenceAckCountOnLatest: null,
      note: 'bounded',
    },
    provenance: {
      openProviderObservabilityGapCount: 0,
      deduplicationPolicy: 'ONE_ROW_PER_SOURCE_MEASUREMENT_ID',
      historicalQueryMode: 'RECENT_DESC_LIMIT',
      historicalMeasuredFrom: null,
      historicalMeasuredTo: null,
      historicalObservationsTruncated: false,
      featureRowsTruncated: false,
    },
    ...overrides,
  };
}

function measured(partial: Partial<LvMeasuredVoltagePointV1>): LvMeasuredVoltagePointV1 {
  return {
    epistemicBand: 'MEASURED',
    observationId: 'o1',
    sourceMeasurementId: 's1',
    voltageV: 12.7,
    voltageObservedAt: '2026-10-21T10:00:00.000Z',
    providerObservationAt: null,
    providerTimestampSource: null,
    operationalContext: 'REST',
    evidenceClass: 'PARKED_REST_CANDIDATE',
    restSessionId: null,
    actualRestAgeHours: null,
    nominalLadderLabel: null,
    isLvCharging: false,
    engineRunning: false,
    ...partial,
  };
}

describe('lv-measured-evidence-display.util', () => {
  it('returns null when no latest measured', () => {
    expect(buildLatestMeasuredEvidenceView(baseData())).toBeNull();
  });

  it('surfaces cranking UNKNOWN and battery NOT_ASSESSED', () => {
    const view = buildLatestMeasuredEvidenceView(
      baseData({ latestMeasured: measured({ evidenceClass: 'ENGINE_OFF_TRANSITION' }) }),
    );
    expect(view?.crankingStatusKey).toContain('unknown');
    expect(view?.batteryHealthAssessmentKey).toContain('NotAssessed');
    expect(view?.evidenceClass).toBe('ENGINE_OFF_TRANSITION');
  });

  it('flags missing provider time with explanation key', () => {
    const view = buildLatestMeasuredEvidenceView(baseData({ latestMeasured: measured({}) }));
    expect(view?.providerTimeMissingExplanationKey).toBeTruthy();
  });

  it('episode with zero points is not evaluable', () => {
    const ep = buildEpisodeEvaluabilityView({
      restSessionId: 'r1',
      sessionStatus: 'RESTING',
      anchorType: 'ENGINE_OFF',
      anchorAt: '2026-10-21T10:00:00.000Z',
      openedAt: '2026-10-21T10:00:00.000Z',
      endedAt: null,
      endReason: null,
      restObservationCount: 0,
      validRestObservationCount: 0,
      measuredPoints: [],
      derivedFeatures: null,
      contextLimitedReason: null,
    });
    expect(ep.evaluabilityLabelKey).toContain('none');
  });

  it('episode with CONTEXT_LIMITED slope maps to slopeLimited', () => {
    const ep = buildEpisodeEvaluabilityView({
      restSessionId: 'r1',
      sessionStatus: 'RESTING',
      anchorType: 'ENGINE_OFF',
      anchorAt: '2026-10-21T10:00:00.000Z',
      openedAt: '2026-10-21T10:00:00.000Z',
      endedAt: null,
      endReason: null,
      restObservationCount: 2,
      validRestObservationCount: 2,
      measuredPoints: [measured({})],
      derivedFeatures: {
        epistemicBand: 'DERIVED',
        canonicalFeatureRowId: 'f1',
        semanticRevision: 1,
        computationPhase: 'C3',
        sessionTrust: 'OK',
        minimumRestVoltageMv: 12000,
        maximumRestVoltageMv: 12100,
        medianRestVoltageMv: 12050,
        robustRestSlopeMvPerHour: -10,
        slopeInterpretability: 'CONTEXT_LIMITED',
        slopeLimitationCodes: ['C3_SLOPE_SHORT_OBSERVATION_SPAN'],
        numberOfValidRestPoints: 2,
        missingRungCount: 0,
        observationSpanMs: 1000,
        retentionPointCount: 2,
      },
      contextLimitedReason: null,
    });
    expect(ep.evaluabilityLabelKey).toContain('slopeLimited');
  });
});
